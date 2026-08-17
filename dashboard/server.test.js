import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { access, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createDashboardServer } from './server.js';
import { createRunner } from './runner.js';
import * as XLSX from 'xlsx';

function fakeSpawn() {
    const calls = [];
    const spawn = (command, args) => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = () => {};
        calls.push({ command, args, child });
        return child;
    };
    return { spawn, calls };
}

function testRunner(spawn) {
    return createRunner({ spawn, tee: null });
}

function parseNdjson(text) {
    return text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

async function waitUntil(predicate) {
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
        if (await predicate()) {
            return;
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('timed out waiting for condition');
}

async function withServer(runner, fn, options = {}) {
    const dashboard = createDashboardServer({ runner, port: 0, ...options });
    const address = await dashboard.listen();
    const base = `http://127.0.0.1:${address.port}`;
    try {
        await fn(base, dashboard);
    } finally {
        await dashboard.close();
    }
}

test('GET / returns the launcher HTML', async () => {
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const response = await fetch(base + '/');
        const html = await response.text();
        assert.equal(response.status, 200);
        assert.match(html, /ADA Scanner/);
        assert.match(html, /id="root"/);
        assert.match(html, /src\/main\.tsx/);
    });
});

test('GET /openapi.json and /api describe the HTTP API', async () => {
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const specResponse = await fetch(base + '/openapi.json');
        const spec = await specResponse.json();
        assert.equal(specResponse.status, 200);
        assert.equal(spec.openapi, '3.1.0');
        assert.equal(spec.paths['/api/runs'].post.operationId, 'startRun');
        assert.equal(spec.paths['/api/runs/current'].get.operationId, 'getCurrentRun');
        assert.equal(spec.paths['/mcp'].post.operationId, 'mcp');
        assert.equal(spec.paths['/api/health'].get.operationId, 'getHealth');

        const indexResponse = await fetch(base + '/api');
        const index = await indexResponse.json();
        assert.equal(indexResponse.status, 200);
        assert.equal(index.openapi, '/openapi.json');
        assert.equal(index.mcp, '/mcp');
        assert.ok(index.operations.some((operation) => operation.operationId === 'listSuites'));
        assert.ok(index.tools.some((tool) => tool.name === 'start_scan'));

        const health = await (await fetch(base + '/api/health')).json();
        assert.equal(health.ok, true);
        assert.equal(health.mcp, '/mcp');
    });
});

test('POST /api/runs starts a scan that GET /api/runs/current can poll', async () => {
    const { spawn, calls } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const started = await fetch(base + '/api/runs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'rivedge' }),
        });
        const startBody = await started.json();
        assert.equal(started.status, 202);
        assert.equal(startBody.status, 'running');

        await waitUntil(() => calls.length === 1);
        calls[0].child.stdout.write('Running 2 tests\n');
        await waitUntil(async () => {
            const snapshot = await (await fetch(base + '/api/runs/current')).json();
            return snapshot.logs.includes('Running 2 tests');
        });
        const running = await (await fetch(base + '/api/runs/current')).json();
        assert.equal(running.status, 'running');
        assert.equal(running.busy, true);
        assert.match(running.logs, /Running 2 tests/);

        calls[0].child.emit('exit', 1);
        await waitUntil(async () => {
            const snapshot = await (await fetch(base + '/api/runs/current')).json();
            return snapshot.status === 'finished';
        });
        const finished = await (await fetch(base + '/api/runs/current')).json();
        assert.equal(finished.status, 'finished');
        assert.equal(finished.code, 1);
        assert.equal(finished.busy, false);
    });
});

test('GET /api/suites returns the configured sites', async () => {
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const response = await fetch(base + '/api/suites');
        const data = await response.json();
        assert.deepEqual(
            data.suites.map((suite) => suite.id),
            ['rivedge', 'at-scale', 'piezonis', 'gnbotf']
        );
        assert.equal(data.busy, false);
    });
});

test('POST /api/run starts the selected site scan and stays busy until it exits', async () => {
    const { spawn, calls } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const pending = fetch(base + '/api/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'rivedge' }),
        });
        await waitUntil(() => calls.length === 1);
        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ['playwright', 'test', 'tests/site.test.ts']);
        calls[0].child.emit('exit', 0);
        const response = await pending;
        const events = parseNdjson(await response.text());
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /ndjson/);
        assert.equal(events.at(-1).ok, true);
        assert.equal(events.at(-1).code, 0);
    });
});

test('POST /api/run streams child output before the process exits', async () => {
    const { spawn, calls } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const pending = fetch(base + '/api/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'rivedge' }),
        });
        await waitUntil(() => calls.length === 1);
        const response = await pending;
        assert.equal(response.status, 200);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const readNextEvent = async () => {
            while (true) {
                const newline = buffer.indexOf('\n');
                if (newline !== -1) {
                    const line = buffer.slice(0, newline);
                    buffer = buffer.slice(newline + 1);
                    if (line.trim()) {
                        return JSON.parse(line);
                    }
                    continue;
                }
                const { value, done } = await reader.read();
                if (done) {
                    throw new Error('stream ended before the next event');
                }
                buffer += decoder.decode(value, { stream: true });
            }
        };

        assert.deepEqual(await readNextEvent(), { type: 'start', id: 'rivedge' });
        calls[0].child.stdout.write('Running 2 tests\n');
        assert.deepEqual(await readNextEvent(), { type: 'log', text: 'Running 2 tests\n' });
        calls[0].child.emit('exit', 1);
        const done = await readNextEvent();
        assert.equal(done.type, 'done');
        assert.equal(done.code, 1);
    });
});

test('POST /api/run while busy is rejected and does not start a second suite', async () => {
    const { spawn, calls } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const first = fetch(base + '/api/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'piezonis' }),
        });
        await waitUntil(() => calls.length === 1);
        const secondResponse = await fetch(base + '/api/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'rivedge' }),
        });
        const second = await secondResponse.json();
        assert.equal(secondResponse.status, 409);
        assert.equal(second.reason, 'busy');
        assert.equal(calls.length, 1);
        calls[0].child.emit('exit', 0);
        await first;
    });
});

test('POST /api/run with empty id does not start a run', async () => {
    const { spawn, calls } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const response = await fetch(base + '/api/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: '' }),
        });
        const data = await response.json();
        assert.equal(response.status, 400);
        assert.equal(data.reason, 'no-selection');
        assert.equal(calls.length, 0);
    });
});

test('GET /api/report and /report serve the Playwright HTML report when it exists', async () => {
    const reportDir = await mkdtemp(path.join(os.tmpdir(), 'ada-report-'));
    await writeFile(path.join(reportDir, 'index.html'), "<html><head><meta name='color-scheme' content='dark light'></head>playwright report</html>");
    await mkdir(path.join(reportDir, 'data'));
    await writeFile(path.join(reportDir, 'data', 'error.md'), '# error');
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const meta = await fetch(base + '/api/report');
        const info = await meta.json();
        assert.equal(meta.status, 200);
        assert.equal(info.available, true);
        assert.equal(info.download, '/api/report/download');

        const download = await fetch(base + '/api/report/download');
        assert.equal(download.status, 200);
        assert.match(download.headers.get('content-disposition') ?? '', /playwright-report\.html/);
        const downloaded = await download.text();
        assert.match(downloaded, /playwright report/);
        assert.match(downloaded, /ada-report-theme/);
        assert.doesNotMatch(downloaded, /href="\/report-theme\.css"/);

        const page = await fetch(base + '/report/');
        assert.equal(page.status, 200);
        const html = await page.text();
        assert.match(html, /content='light'/);
        assert.doesNotMatch(html, /content='dark light'/);

        const theme = await fetch(base + '/report-theme.css');
        assert.equal(theme.status, 200);
        assert.match(await theme.text(), /#1a1a1a/);

        const asset = await fetch(base + '/report/data/error.md');
        assert.equal(asset.status, 200);
        assert.match(await asset.text(), /error/);
    }, { reportDir });
});

test('GET /report rejects path traversal and missing reports', async () => {
    const reportDir = await mkdtemp(path.join(os.tmpdir(), 'ada-report-missing-'));
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const missing = await fetch(base + '/report/');
        assert.equal(missing.status, 404);
        const escaped = await fetch(base + '/report/%2e%2e/package.json');
        assert.ok([403, 404].includes(escaped.status));
        const info = await (await fetch(base + '/api/report')).json();
        assert.equal(info.available, false);
        const download = await fetch(base + '/api/report/download');
        assert.equal(download.status, 404);
    }, { reportDir });
});

test('DELETE /api/report removes the HTML report', async () => {
    const reportDir = await mkdtemp(path.join(os.tmpdir(), 'ada-report-del-'));
    await writeFile(path.join(reportDir, 'index.html'), '<html>ready</html>');
    await mkdir(path.join(reportDir, 'data'));
    await writeFile(path.join(reportDir, 'data', 'error.md'), '# error');
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const removed = await fetch(base + '/api/report', { method: 'DELETE' });
        const body = await removed.json();
        assert.equal(removed.status, 200);
        assert.equal(body.ok, true);
        assert.equal(body.available, false);
        await assert.rejects(() => access(path.join(reportDir, 'index.html')));

        const info = await (await fetch(base + '/api/report')).json();
        assert.equal(info.available, false);

        const missing = await fetch(base + '/api/report', { method: 'DELETE' });
        assert.equal(missing.status, 404);
    }, { reportDir });
});

test('POST /api/run done event says when a report is ready', async () => {
    const reportDir = await mkdtemp(path.join(os.tmpdir(), 'ada-report-run-'));
    await writeFile(path.join(reportDir, 'index.html'), '<html>ready</html>');
    const { spawn, calls } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const pending = fetch(base + '/api/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'rivedge' }),
        });
        await waitUntil(() => calls.length === 1);
        calls[0].child.emit('exit', 1);
        const events = parseNdjson(await (await pending).text());
        assert.equal(events.at(-1).type, 'done');
        assert.equal(events.at(-1).report, true);
    }, { reportDir });
});

test('GET /api/spreadsheets lists xlsx files and serves downloads', async () => {
    const spreadsheetsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-sheets-'));
    await writeFile(path.join(spreadsheetsDir, 'home.xlsx'), 'home-sheet');
    await writeFile(path.join(spreadsheetsDir, 'work-list.xlsx'), 'work-sheet');
    await writeFile(path.join(spreadsheetsDir, 'notes.txt'), 'ignore me');
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const listed = await fetch(base + '/api/spreadsheets');
        const data = await listed.json();
        assert.equal(listed.status, 200);
        assert.deepEqual(
            data.files.map((file) => file.name),
            ['home.xlsx', 'work-list.xlsx']
        );
        assert.equal(data.files[0].href, '/api/spreadsheets/home.xlsx');

        const download = await fetch(base + '/api/spreadsheets/home.xlsx');
        assert.equal(download.status, 200);
        assert.match(download.headers.get('content-disposition') ?? '', /home\.xlsx/);
        assert.equal(await download.text(), 'home-sheet');
    }, { spreadsheetsDir });
});

test('GET /api/spreadsheets is empty when the folder is missing', async () => {
    const spreadsheetsDir = path.join(os.tmpdir(), `ada-sheets-missing-${Date.now()}`);
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const listed = await fetch(base + '/api/spreadsheets');
        const data = await listed.json();
        assert.equal(listed.status, 200);
        assert.deepEqual(data.files, []);
    }, { spreadsheetsDir });
});

test('DELETE /api/spreadsheets removes a file and rejects traversal', async () => {
    const spreadsheetsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-sheets-del-'));
    const target = path.join(spreadsheetsDir, 'home.xlsx');
    await writeFile(target, 'home-sheet');
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const removed = await fetch(base + '/api/spreadsheets/home.xlsx', { method: 'DELETE' });
        const body = await removed.json();
        assert.equal(removed.status, 200);
        assert.equal(body.ok, true);
        await assert.rejects(() => access(target));

        const missing = await fetch(base + '/api/spreadsheets/home.xlsx', { method: 'DELETE' });
        assert.equal(missing.status, 404);

        const notSheet = await fetch(base + '/api/spreadsheets/notes.txt');
        assert.equal(notSheet.status, 403);
        const escapedName = encodeURIComponent('../package.json');
        const escaped = await fetch(`${base}/api/spreadsheets/${escapedName}`, { method: 'DELETE' });
        assert.ok([403, 404].includes(escaped.status));
        const escapedGet = await fetch(`${base}/api/spreadsheets/${escapedName}`);
        assert.ok([403, 404].includes(escapedGet.status));
    }, { spreadsheetsDir });
});

test('POST /api/spreadsheets/download zips selected files', async () => {
    const spreadsheetsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-sheets-zip-'));
    await writeFile(path.join(spreadsheetsDir, 'home.xlsx'), 'home-sheet');
    await writeFile(path.join(spreadsheetsDir, 'work-list.xlsx'), 'work-sheet');
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const empty = await fetch(base + '/api/spreadsheets/download', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ names: [] }),
        });
        assert.equal(empty.status, 400);

        const single = await fetch(base + '/api/spreadsheets/download', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ names: ['home.xlsx'] }),
        });
        assert.equal(single.status, 200);
        assert.match(single.headers.get('content-disposition') ?? '', /home\.xlsx/);
        assert.equal(await single.text(), 'home-sheet');

        const batch = await fetch(base + '/api/spreadsheets/download', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ names: ['home.xlsx', 'work-list.xlsx'] }),
        });
        assert.equal(batch.status, 200);
        assert.match(batch.headers.get('content-disposition') ?? '', /spreadsheets\.zip/);
        const zip = Buffer.from(await batch.arrayBuffer());
        assert.equal(zip.subarray(0, 2).toString(), 'PK');
        assert.match(zip.toString('binary'), /home\.xlsx/);
        assert.match(zip.toString('binary'), /work-list\.xlsx/);

        const missing = await fetch(base + '/api/spreadsheets/download', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ names: ['missing.xlsx'] }),
        });
        assert.equal(missing.status, 404);
        const invalid = await fetch(base + '/api/spreadsheets/download', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ names: ['notes.txt'] }),
        });
        assert.equal(invalid.status, 403);
    }, { spreadsheetsDir });
});

test('POST /api/spreadsheets/delete removes the selected files', async () => {
    const spreadsheetsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-sheets-batch-del-'));
    const home = path.join(spreadsheetsDir, 'home.xlsx');
    const work = path.join(spreadsheetsDir, 'work-list.xlsx');
    const keep = path.join(spreadsheetsDir, 'resources.xlsx');
    await writeFile(home, 'home-sheet');
    await writeFile(work, 'work-sheet');
    await writeFile(keep, 'keep-sheet');
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const empty = await fetch(base + '/api/spreadsheets/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ names: [] }),
        });
        assert.equal(empty.status, 400);

        const removed = await fetch(base + '/api/spreadsheets/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ names: ['home.xlsx', 'work-list.xlsx'] }),
        });
        const body = await removed.json();
        assert.equal(removed.status, 200);
        assert.deepEqual(body.deleted, ['home.xlsx', 'work-list.xlsx']);
        await assert.rejects(() => access(home));
        await assert.rejects(() => access(work));
        await access(keep);
    }, { spreadsheetsDir });
});

test('POST /api/spreadsheets/combine writes master-list and work-list', async () => {
    const spreadsheetsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-sheets-combine-'));
    const home = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        home,
        XLSX.utils.json_to_sheet([
            { page: 'home', target: '#nav', failureSummary: 'contrast' },
            { page: 'home', target: '#cta', failureSummary: 'name' },
        ])
    );
    XLSX.writeFile(home, path.join(spreadsheetsDir, 'home.xlsx'));
    const about = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        about,
        XLSX.utils.json_to_sheet([{ page: 'about', target: '#nav', failureSummary: 'contrast' }])
    );
    XLSX.writeFile(about, path.join(spreadsheetsDir, 'about.xlsx'));
    const { spawn } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const response = await fetch(base + '/api/spreadsheets/combine', { method: 'POST' });
        const combined = await response.json();
        assert.equal(response.status, 200);
        assert.equal(combined.ok, true);
        assert.equal(combined.master.name, 'master-list.xlsx');
        assert.equal(combined.work.name, 'work-list.xlsx');
        assert.equal(combined.master.rows, 3);
        assert.equal(combined.work.rows, 2);

        const listed = await (await fetch(base + '/api/spreadsheets')).json();
        assert.ok(listed.files.some((file) => file.name === 'master-list.xlsx'));
        assert.ok(listed.files.some((file) => file.name === 'work-list.xlsx'));
    }, { spreadsheetsDir });
});

test('POST /api/spreadsheets/combine while a scan is running is rejected', async () => {
    const spreadsheetsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-sheets-combine-busy-'));
    const home = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        home,
        XLSX.utils.json_to_sheet([{ page: 'home', target: '#nav', failureSummary: 'contrast' }])
    );
    XLSX.writeFile(home, path.join(spreadsheetsDir, 'home.xlsx'));
    const { spawn, calls } = fakeSpawn();
    await withServer(testRunner(spawn), async (base) => {
        const pending = fetch(base + '/api/runs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'rivedge' }),
        });
        await waitUntil(() => calls.length === 1);
        const combined = await fetch(base + '/api/spreadsheets/combine', { method: 'POST' });
        const body = await combined.json();
        assert.equal(combined.status, 409);
        assert.equal(body.reason, 'busy');
        calls[0].child.emit('exit', 0);
        await pending;
    }, { spreadsheetsDir });
});
