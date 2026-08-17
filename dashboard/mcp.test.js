import assert from 'node:assert/strict';
import test from 'node:test';
import { createScannerClient } from './client.js';
import { createDashboardServer } from './server.js';
import { createRunner } from './runner.js';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

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

test('scanner client talks to the same HTTP API the UI uses', async () => {
    const { spawn, calls } = fakeSpawn();
    const dashboard = createDashboardServer({
        runner: createRunner({ spawn, tee: null }),
        port: 0,
    });
    const address = await dashboard.listen();
    const client = createScannerClient({ baseUrl: `http://127.0.0.1:${address.port}` });
    try {
        const suites = await client.listSuites();
        assert.equal(suites.ok, true);
        assert.ok(suites.data.suites.some((suite) => suite.id === 'rivedge'));

        const started = await client.startRun('rivedge');
        assert.equal(started.status, 202);
        assert.equal(started.data.status, 'running');
        assert.equal(calls.length, 1);
        calls[0].child.emit('exit', 0);
        await new Promise((resolve) => setImmediate(resolve));

        const finished = await client.getCurrentRun();
        assert.equal(finished.data.id, 'rivedge');
        assert.equal(finished.data.status, 'finished');
        assert.equal(finished.data.code, 0);
    } finally {
        await dashboard.close();
    }
});
