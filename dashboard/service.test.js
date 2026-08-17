import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createRunner } from './runner.js';
import { createScannerService } from './service.js';
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

test('service starts a suite and reports it as the current run', async () => {
    const { spawn, calls } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null }),
        reportDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-report-')),
        spreadsheetsDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-sheets-')),
    });

    const started = service.startRun('rivedge');
    assert.equal(started.ok, true);
    assert.equal(started.status, 202);
    assert.equal(started.data.status, 'running');
    assert.equal(calls.length, 1);

    calls[0].child.stdout.write('Running 2 tests\n');
    calls[0].child.emit('exit', 0);
    await started.result.done;

    const current = await service.getCurrentRun();
    assert.equal(current.data.status, 'finished');
    assert.equal(current.data.code, 0);
    assert.match(current.data.logs, /Running 2 tests/);
});

test('service lists and deletes spreadsheets', async () => {
    const spreadsheetsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-service-del-'));
    await writeFile(path.join(spreadsheetsDir, 'home.xlsx'), 'home-sheet');
    await writeFile(path.join(spreadsheetsDir, 'notes.txt'), 'ignore me');
    const { spawn } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null }),
        reportDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-report-')),
        spreadsheetsDir,
    });

    const listed = await service.listSpreadsheets();
    assert.deepEqual(
        listed.data.files.map((file) => file.name),
        ['home.xlsx']
    );
    assert.equal(listed.data.files[0].path, path.resolve(spreadsheetsDir, 'home.xlsx'));

    const deleted = await service.deleteSpreadsheets(['home.xlsx']);
    assert.deepEqual(deleted.data.deleted, ['home.xlsx']);
    const empty = await service.listSpreadsheets();
    assert.deepEqual(empty.data.files, []);
});

test('waitForRun returns once the child exits', async () => {
    const { spawn, calls } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null }),
        reportDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-wait-')),
        spreadsheetsDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-wait-sheets-')),
    });
    service.startRun('piezonis');
    setImmediate(() => calls[0].child.emit('exit', 1));
    const finished = await service.waitForRun({ timeoutMs: 1000, intervalMs: 10 });
    assert.equal(finished.data.status, 'finished');
    assert.equal(finished.data.code, 1);
});

test('service combines per-page spreadsheets into master-list and work-list', async () => {
    const spreadsheetsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-service-combine-'));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet([
            { page: 'home', target: '#nav', failureSummary: 'contrast' },
            { page: 'home', target: '#cta', failureSummary: 'name' },
        ])
    );
    XLSX.writeFile(workbook, path.join(spreadsheetsDir, 'home.xlsx'));
    const about = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        about,
        XLSX.utils.json_to_sheet([{ page: 'about', target: '#nav', failureSummary: 'contrast' }])
    );
    XLSX.writeFile(about, path.join(spreadsheetsDir, 'about.xlsx'));

    const { spawn } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null }),
        reportDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-combine-report-')),
        spreadsheetsDir,
    });
    const combined = service.combineSpreadsheets();
    assert.equal(combined.ok, true);
    assert.equal(combined.data.master.rows, 3);
    assert.equal(combined.data.work.rows, 2);
    const listed = await service.listSpreadsheets();
    assert.deepEqual(
        listed.data.files.map((file) => file.name),
        ['about.xlsx', 'home.xlsx', 'master-list.xlsx', 'work-list.xlsx']
    );
});
