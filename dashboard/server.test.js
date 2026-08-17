import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createDashboardServer } from './server.js';
import { createRunner } from './runner.js';

function fakeSpawn() {
    const calls = [];
    const spawn = (command, args) => {
        const child = new EventEmitter();
        child.kill = () => {};
        calls.push({ command, args, child });
        return child;
    };
    return { spawn, calls };
}

async function waitUntil(predicate) {
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('timed out waiting for condition');
}

async function withServer(runner, fn) {
    const dashboard = createDashboardServer({ runner, port: 0 });
    const address = await dashboard.listen();
    const base = `http://127.0.0.1:${address.port}`;
    try {
        await fn(base);
    } finally {
        await dashboard.close();
    }
}

test('GET / returns the launcher HTML', async () => {
    const { spawn } = fakeSpawn();
    await withServer(createRunner({ spawn }), async (base) => {
        const response = await fetch(base + '/');
        const html = await response.text();
        assert.equal(response.status, 200);
        assert.match(html, /Site test/);
        assert.match(html, /id="run"/);
    });
});

test('GET /api/suites returns the four package.json test scripts', async () => {
    const { spawn } = fakeSpawn();
    await withServer(createRunner({ spawn }), async (base) => {
        const response = await fetch(base + '/api/suites');
        const data = await response.json();
        assert.deepEqual(
            data.suites.map((suite) => suite.id),
            ['rivedge', 'at-scale', 'piezonis', 'gnbotf']
        );
        assert.equal(data.busy, false);
    });
});

test('POST /api/run starts the selected npm script and stays busy until it exits', async () => {
    const { spawn, calls } = fakeSpawn();
    await withServer(createRunner({ spawn }), async (base) => {
        const pending = fetch(base + '/api/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'rivedge' }),
        });
        await waitUntil(() => calls.length === 1);
        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].args, ['run', 'test:rivedge']);
        calls[0].child.emit('exit', 0);
        const response = await pending;
        const data = await response.json();
        assert.equal(response.status, 200);
        assert.equal(data.ok, true);
        assert.equal(data.code, 0);
    });
});

test('POST /api/run while busy is rejected and does not start a second suite', async () => {
    const { spawn, calls } = fakeSpawn();
    await withServer(createRunner({ spawn }), async (base) => {
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
    await withServer(createRunner({ spawn }), async (base) => {
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
