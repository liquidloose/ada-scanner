import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createRunner } from './runner.js';
import { loadSuites, suites } from './suites.js';

function fakeSpawn() {
    const calls = [];
    const spawn = (command, args, options) => {
        const child = new EventEmitter();
        child.kill = () => {};
        calls.push({ command, args, options, child });
        return child;
    };
    return { spawn, calls };
}

test('catalog is the test:* scripts already in package.json', () => {
    const ids = suites.map((suite) => suite.id);
    assert.deepEqual(ids, ['rivedge', 'at-scale', 'piezonis', 'gnbotf']);
    assert.deepEqual(
        suites.map((suite) => suite.script),
        ['test:rivedge', 'test:at-scale', 'test:piezonis', 'test:gnbotf']
    );
    assert.equal(suites.some((suite) => suite.id === 'ada'), false);
});

test('loadSuites reads test:* entries from a package.json', () => {
    const loaded = loadSuites(new URL('../package.json', import.meta.url).pathname);
    assert.equal(loaded.length, 4);
    assert.equal(loaded[0].testFile, 'tests/rivedge.test.ts');
});

test('start with a known suite runs that npm script', async () => {
    const { spawn, calls } = fakeSpawn();
    const runner = createRunner({ spawn });
    const result = runner.start('rivedge');
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'npm');
    assert.deepEqual(calls[0].args, ['run', 'test:rivedge']);
    assert.equal(runner.isBusy(), true);
    calls[0].child.emit('exit', 1);
    await result.done;
    assert.equal(runner.isBusy(), false);
});

test('start while busy does not spawn a second child', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = createRunner({ spawn });
    const first = runner.start('piezonis');
    assert.equal(first.ok, true);
    const second = runner.start('rivedge');
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'busy');
    assert.equal(calls.length, 1);
});

test('start with no id does not spawn', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = createRunner({ spawn });
    const result = runner.start('');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-selection');
    assert.equal(calls.length, 0);
});

test('start with unknown id does not spawn', () => {
    const { spawn, calls } = fakeSpawn();
    const runner = createRunner({ spawn });
    const result = runner.start('ada');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unknown');
    assert.equal(calls.length, 0);
});

test('start is allowed again after the child exits', async () => {
    const { spawn, calls } = fakeSpawn();
    const runner = createRunner({ spawn });
    const first = runner.start('at-scale');
    calls[0].child.emit('exit', 0);
    await first.done;
    const second = runner.start('gnbotf');
    assert.equal(second.ok, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].args, ['run', 'test:gnbotf']);
});
