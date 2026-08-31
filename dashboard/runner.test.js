import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createRunner, killProcessTree, scanEnv } from './runner.js';
import { loadSuites, suites } from './suites.js';

function fakeSpawn() {
    const calls = [];
    const spawn = (command, args, options) => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = (signal) => {
            child.signal = signal;
        };
        calls.push({ command, args, options, child });
        return child;
    };
    return { spawn, calls };
}

function testRunner(spawn, options = {}) {
    return createRunner({ spawn, tee: null, hungAfterMs: 0, ...options });
}

test('reloadCatalog picks up sites added after start', () => {
    const { spawn } = fakeSpawn();
    let catalog = [{ id: 'demo', label: 'Demo', script: 'test:demo', baseURL: 'https://example.com', testFile: 'tests/site.test.ts' }];
    const runner = testRunner(spawn, {
        suites: catalog,
        loadCatalog: () => catalog,
    });
    assert.deepEqual(
        runner.listSuites().map((suite) => suite.id),
        ['demo']
    );
    catalog = [
        ...catalog,
        { id: 'piezonis', label: "Piezoni's", script: 'test:piezonis', baseURL: 'https://piezonis.com', testFile: 'tests/site.test.ts' },
    ];
    runner.reloadCatalog();
    assert.equal(runner.listSuites().some((suite) => suite.id === 'piezonis'), true);
});

test('catalog is the sites in config/sites.json', () => {
    const ids = suites.map((suite) => suite.id);
    for (const id of ['rivedge', 'at-scale', 'piezonis', 'gnbotf']) {
        assert.ok(ids.includes(id), id);
    }
    assert.equal(suites.find((suite) => suite.id === 'rivedge')?.script, 'test:rivedge');
    assert.equal(suites[0].label, "River's Edge");
    assert.equal(suites[0].baseURL, 'https://rivedge-site.ferret-boa.ts.net');
    assert.equal(suites.some((suite) => suite.id === 'ada'), false);
});

test('loadSuites reads sites from a config file', () => {
    const loaded = loadSuites(new URL('../config/sites.json', import.meta.url).pathname);
    assert.ok(loaded.length >= 4);
    assert.equal(loaded[0].testFile, 'tests/site.test.ts');
});

test('start with a known suite runs playwright with SITE_ID', async () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn);
    const result = runner.start('rivedge');
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'npx');
    assert.deepEqual(calls[0].args, ['playwright', 'test', 'tests/site.test.ts']);
    assert.equal(calls[0].options.env.SITE_ID, 'rivedge');
    assert.equal(calls[0].options.env.SCAN_PROJECTS, 'chromium,Mobile Chrome');
    assert.match(calls[0].options.env.ALLURE_RESULTS_DIR, /^allure-results\/rivedge-\d{4}-\d{2}-\d{2}T/);
    assert.equal(calls[0].options.env.PLAYWRIGHT_NO_SANDBOX, '1');
    assert.equal(calls[0].options.env.npm_config_devdir, undefined);
    assert.deepEqual(calls[0].options.stdio, ['ignore', 'pipe', 'pipe']);
    assert.equal(runner.isBusy(), true);
    calls[0].child.emit('exit', 1);
    await result.done;
    assert.equal(runner.isBusy(), false);
});

test('start forwards stdout and stderr as they arrive', async () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn);
    const result = runner.start('rivedge');
    const chunks = [];
    result.output.on('data', (text) => chunks.push(text));
    calls[0].child.stdout.write('Running 2 tests using 1 worker\n');
    calls[0].child.stderr.write('\u001b[31m  ✘ homepage\u001b[0m\r');
    calls[0].child.emit('exit', 1);
    await result.done;
    assert.deepEqual(chunks, ['Running 2 tests using 1 worker\n', '  ✘ homepage\n']);
    assert.equal(runner.getCurrent().status, 'finished');
    assert.equal(runner.getCurrent().code, 1);
    assert.match(runner.getCurrent().logs, /Running 2 tests/);
});

test('start while busy does not spawn a second child', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn);
    const first = runner.start('piezonis');
    assert.equal(first.ok, true);
    const second = runner.start('rivedge');
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'busy');
    assert.equal(calls.length, 1);
});

test('start with no id does not spawn', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn);
    const result = runner.start('');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-selection');
    assert.equal(calls.length, 0);
});

test('start points Allure results at a timestamped site folder', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn, { now: () => Date.parse('2026-08-18T15:39:12.123Z') });
    const result = runner.start('rivedge');
    assert.equal(result.ok, true);
    assert.equal(calls[0].options.env.ALLURE_RESULTS_DIR, 'allure-results/rivedge-2026-08-18T15-39-12-123Z');
});

test('start with selected projects sets SCAN_PROJECTS', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn);
    const result = runner.start('rivedge', { projects: ['webkit', 'iPad'] });
    assert.equal(result.ok, true);
    assert.equal(calls[0].options.env.SCAN_PROJECTS, 'webkit,iPad');
});

test('start with no projects selected does not spawn', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn);
    const result = runner.start('rivedge', { projects: [] });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-projects');
    assert.equal(calls.length, 0);
});

test('start with an unknown project does not spawn', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn);
    const result = runner.start('rivedge', { projects: ['firefox'] });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unknown-project');
    assert.equal(calls.length, 0);
});

test('start with unknown id does not spawn', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn);
    const result = runner.start('ada');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unknown');
    assert.equal(calls.length, 0);
});

test('scanEnv drops Cursor npm config that prints the unknown devdir warning', () => {
    const env = scanEnv(
        { SITE_ID: 'rivedge' },
        {
            PATH: '/usr/bin',
            npm_config_devdir: '/tmp/cursor-sandbox-cache/node-gyp',
            NPM_CONFIG_CACHE: '/tmp/cursor-sandbox-cache/npm',
        }
    );
    assert.equal(env.SITE_ID, 'rivedge');
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(env.npm_config_devdir, undefined);
    assert.equal(env.NPM_CONFIG_CACHE, undefined);
    assert.equal(env.PLAYWRIGHT_NO_SANDBOX, '1');
});

test('start is allowed again after the child exits', async () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn);
    const first = runner.start('at-scale');
    calls[0].child.emit('exit', 0);
    await first.done;
    const second = runner.start('gnbotf');
    assert.equal(second.ok, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].args, ['playwright', 'test', 'tests/site.test.ts']);
    assert.equal(calls[1].options.env.SITE_ID, 'gnbotf');
});

test('stop kills a running scan and unlocks the runner', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn);
    runner.start('rivedge');
    const stopped = runner.stop();
    assert.equal(stopped.ok, true);
    assert.equal(stopped.stopped, true);
    assert.equal(calls[0].child.signal, 'SIGTERM');
    assert.equal(runner.isBusy(), false);
    const current = runner.getCurrent();
    assert.equal(current.status, 'finished');
    assert.equal(current.stopped, true);
    assert.equal(current.busy, false);
    assert.match(current.logs, /Scan stopped/);
    const again = runner.start('piezonis');
    assert.equal(again.ok, true);
});

test('stop is a no-op when nothing is running', () => {
    const runner = testRunner(fakeSpawn().spawn);
    const stopped = runner.stop();
    assert.equal(stopped.ok, true);
    assert.equal(stopped.stopped, false);
    assert.equal(runner.getCurrent().status, 'idle');
});

test('a scan with no Playwright output is marked hung and cleared', () => {
    const { spawn, calls } = fakeSpawn();
    const pending = [];
    const runner = testRunner(spawn, {
        hungAfterMs: 40,
        setTimer: (fn) => {
            const handle = { fn };
            pending.push(handle);
            return handle;
        },
        clearTimer: (handle) => {
            const index = pending.indexOf(handle);
            if (index >= 0) {
                pending.splice(index, 1);
            }
        },
    });
    runner.start('rivedge');
    assert.equal(pending.length, 1);
    pending[0].fn();
    const current = runner.getCurrent();
    assert.equal(current.status, 'finished');
    assert.equal(current.hung, true);
    assert.equal(current.stopped, true);
    assert.equal(current.busy, false);
    assert.equal(calls[0].child.signal, 'SIGTERM');
    assert.match(current.logs, /hung/);
    assert.equal(runner.start('piezonis').ok, true);
});

test('Playwright output resets the hung timer', () => {
    const { spawn, calls } = fakeSpawn();
    const pending = [];
    const runner = testRunner(spawn, {
        hungAfterMs: 40,
        setTimer: (fn) => {
            const handle = { fn };
            pending.push(handle);
            return handle;
        },
        clearTimer: (handle) => {
            const index = pending.indexOf(handle);
            if (index >= 0) {
                pending.splice(index, 1);
            }
        },
    });
    runner.start('rivedge');
    const first = pending[0];
    calls[0].child.stdout.write('Running 2 tests\n');
    assert.equal(pending.includes(first), false);
    first.fn();
    assert.equal(runner.isBusy(), true);
    assert.equal(runner.getCurrent().hung, false);
    pending[0].fn();
    assert.equal(runner.getCurrent().hung, true);
    assert.equal(runner.isBusy(), false);
});

test('killProcessTree signals descendants before the parent', () => {
    const signaled = [];
    killProcessTree(1, {
        kill: (pid) => signaled.push(pid),
        childrenOf: (pid) => (pid === 1 ? [2, 4, 3] : []),
    });
    assert.deepEqual(signaled, [3, 4, 2, 1]);
});
