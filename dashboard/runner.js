import { spawn as defaultSpawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import stripAnsi from 'strip-ansi';
import { suites as defaultSuites } from './suites.js';

function idleRun() {
    return {
        id: null,
        status: 'idle',
        code: null,
        logs: '',
        startedAt: null,
        finishedAt: null,
    };
}

export function createRunner({
    spawn = defaultSpawn,
    suites = defaultSuites,
    cwd = process.cwd(),
    tee = process,
} = {}) {
    let child = null;
    let current = idleRun();

    return {
        listSuites() {
            return suites.map(({ id, label, script }) => ({ id, label, script }));
        },
        isBusy() {
            return child != null;
        },
        getCurrent() {
            return { ...current, busy: child != null };
        },
        start(id) {
            if (!id) {
                return { ok: false, reason: 'no-selection' };
            }

            const suite = suites.find((entry) => entry.id === id);
            if (!suite) {
                return { ok: false, reason: 'unknown' };
            }
            if (child) {
                return { ok: false, reason: 'busy' };
            }

            const running = spawn('npm', ['run', suite.script], {
                cwd,
                env: { ...process.env, FORCE_COLOR: '0', PLAYWRIGHT_HTML_OPEN: 'never' },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            child = running;
            current = {
                id,
                status: 'running',
                code: null,
                logs: '',
                startedAt: new Date().toISOString(),
                finishedAt: null,
            };

            const output = new EventEmitter();
            const emitChunk = (chunk) => {
                const text = normalizeOutput(chunk.toString());
                if (!text) {
                    return;
                }
                current.logs += text;
                output.emit('data', text);
            };
            running.stdout?.on('data', (chunk) => {
                emitChunk(chunk);
                tee?.stdout?.write(chunk);
            });
            running.stderr?.on('data', (chunk) => {
                emitChunk(chunk);
                tee?.stderr?.write(chunk);
            });

            const done = new Promise((resolve) => {
                const finish = (code) => {
                    if (child === running) {
                        child = null;
                    }
                    current = {
                        ...current,
                        status: 'finished',
                        code,
                        finishedAt: new Date().toISOString(),
                    };
                    resolve({ code });
                };
                running.once('exit', finish);
                running.once('error', () => finish(1));
            });

            return { ok: true, suite, done, output };
        },
    };
}

function normalizeOutput(text) {
    return stripAnsi(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
