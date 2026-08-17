import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createScannerClient } from './client.js';
import { createScannerMcpServer, resolveScannerBackend, scannerTools } from './mcp.js';
import { createRunner } from './runner.js';
import { createDashboardServer } from './server.js';
import { createScannerService } from './service.js';

function fakeSpawn() {
    const calls = [];
    const spawn = (command, args) => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = (signal) => {
            child.signal = signal;
        };
        calls.push({ command, args, child });
        return child;
    };
    return { spawn, calls };
}

function toolData(result) {
    assert.equal(result.content[0].type, 'text');
    return JSON.parse(result.content[0].text);
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

async function withMcpClient(service, fn) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createScannerMcpServer({ service });
    const client = new Client({ name: 'ada-scanner-test', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
        await fn(client);
    } finally {
        await client.close();
        await server.close();
    }
}

test('scanner client talks to the same HTTP API the UI uses', async () => {
    const { spawn, calls } = fakeSpawn();
    await withServer(createRunner({ spawn, tee: null, hungAfterMs: 0 }), async (base) => {
        const client = createScannerClient({ baseUrl: base });
        const suites = await client.listSuites();
        assert.equal(suites.ok, true);
        assert.ok(suites.data.suites.some((suite) => suite.id === 'rivedge'));

        const started = await client.startRun('rivedge');
        assert.equal(started.status, 202);
        assert.equal(started.data.status, 'running');
        assert.equal(calls.length, 1);
        calls[0].child.emit('exit', 0);

        const finished = await client.waitForRun({ timeoutMs: 1000, intervalMs: 10 });
        assert.equal(finished.data.id, 'rivedge');
        assert.equal(finished.data.status, 'finished');
        assert.equal(finished.data.code, 0);
    });
});

test('MCP tools call the scanner service, not HTTP paths', async () => {
    const { spawn, calls } = fakeSpawn();
    const spreadsheetsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-mcp-sheets-'));
    await writeFile(path.join(spreadsheetsDir, 'home.xlsx'), 'home-sheet');
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null, hungAfterMs: 0 }),
        reportDir: await mkdtemp(path.join(os.tmpdir(), 'ada-mcp-report-')),
        spreadsheetsDir,
    });

    await withMcpClient(service, async (client) => {
        const listed = await client.listTools();
        assert.deepEqual(
            listed.tools.map((tool) => tool.name),
            scannerTools.map((tool) => tool.name)
        );

        const suites = toolData(await client.callTool({ name: 'list_suites', arguments: {} }));
        assert.ok(suites.suites.some((suite) => suite.id === 'rivedge'));

        const started = toolData(await client.callTool({ name: 'start_scan', arguments: { id: 'rivedge' } }));
        assert.equal(started.status, 'running');
        assert.equal(calls.length, 1);
        const stopped = toolData(await client.callTool({ name: 'stop_scan', arguments: {} }));
        assert.equal(stopped.stopped, true);
        assert.equal(stopped.status, 'finished');
        assert.equal(calls[0].child.signal, 'SIGTERM');

        const sheets = toolData(await client.callTool({ name: 'list_spreadsheets', arguments: {} }));
        assert.deepEqual(
            sheets.files.map((file) => file.name),
            ['home.xlsx']
        );
    });
});

test('stdio MCP attaches to a running dashboard so UI and agents share one runner', async () => {
    const { spawn, calls } = fakeSpawn();
    await withServer(createRunner({ spawn, tee: null, hungAfterMs: 0 }), async (base) => {
        const backend = await resolveScannerBackend({ url: base });
        assert.equal(backend.kind, 'http');
        const started = await backend.service.startRun('rivedge');
        assert.equal(started.status, 202);
        assert.equal(calls.length, 1);
        calls[0].child.emit('exit', 0);
    });
});

test('stdio MCP owns the runner when the dashboard is down', async () => {
    const backend = await resolveScannerBackend({
        url: 'http://127.0.0.1:1',
        fetchImpl: async () => {
            throw new Error('down');
        },
    });
    assert.equal(backend.kind, 'in-process');
    const suites = await backend.service.listSuites();
    assert.equal(suites.ok, true);
});

test('dashboard /mcp exposes the same tools over Streamable HTTP', async () => {
    const { spawn, calls } = fakeSpawn();
    await withServer(createRunner({ spawn, tee: null, hungAfterMs: 0 }), async (base) => {
        const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
        const client = new Client({ name: 'ada-scanner-http-test', version: '1.0.0' });
        await client.connect(transport);
        try {
            const started = toolData(await client.callTool({ name: 'start_scan', arguments: { id: 'rivedge' } }));
            assert.equal(started.status, 'running');
            const current = await (await fetch(`${base}/api/runs/current`)).json();
            assert.equal(current.status, 'running');
            assert.equal(current.id, 'rivedge');
            assert.equal(calls.length, 1);
            calls[0].child.emit('exit', 0);
            const deadline = Date.now() + 1000;
            let finished;
            while (Date.now() < deadline) {
                finished = await (await fetch(`${base}/api/runs/current`)).json();
                if (finished.status === 'finished') {
                    break;
                }
                await new Promise((resolve) => setImmediate(resolve));
            }
            assert.equal(finished.status, 'finished');
        } finally {
            await client.close();
        }
    });
});
