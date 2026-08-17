import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createRunner } from './runner.js';
import { loadSuites, suites } from './suites.js';

function fakeSpawn() {
    const calls = [];
    const spawn = (command, args, options) => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = () => {};
        calls.push({ command, args, options, child });
        return child;
    };
    return { spawn, calls };
}

function testRunner(spawn) {
    return createRunner({ spawn, tee: null });
}

test('catalog is the sites in config/sites.json', () => {
    const ids = suites.map((suite) => suite.id);
    assert.deepEqual(ids, ['rivedge', 'at-scale', 'piezonis', 'gnbotf']);
    assert.deepEqual(
        suites.map((suite) => suite.script),
        ['test:rivedge', 'test:at-scale', 'test:piezonis', 'test:gnbotf']
    );
    assert.equal(suites[0].label, "River's Edge");
    assert.equal(suites.some((suite) => suite.id === 'ada'), false);
});

test('loadSuites reads sites from a config file', () => {
    const loaded = loadSuites(new URL('../config/sites.json', import.meta.url).pathname);
    assert.equal(loaded.length, 4);
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

test('start with unknown id does not spawn', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = testRunner(spawn);
    const result = runner.start('ada');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unknown');
    assert.equal(calls.length, 0);
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
