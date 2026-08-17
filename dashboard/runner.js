import { spawn as defaultSpawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import stripAnsi from 'strip-ansi';
import { suites as defaultSuites } from './suites.js';

export const defaultHungAfterMs = 60_000;

export function envMs(name, fallback) {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function idleRun() {
    return {
        id: null,
        status: 'idle',
        code: null,
        logs: '',
        startedAt: null,
        finishedAt: null,
        stopped: false,
        hung: false,
    };
}

export function descendantPids(pid, { readChildren } = {}) {
    const read =
        readChildren ??
        ((id) => {
            try {
                return readFileSync(`/proc/${id}/task/${id}/children`, 'utf8')
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .map(Number);
            } catch {
                return [];
            }
        });
    const found = [];
    const visit = (id) => {
        for (const childPid of read(id)) {
            found.push(childPid);
            visit(childPid);
        }
    };
    visit(pid);
    return found;
}

export function killProcessTree(pid, { signal = 'SIGTERM', kill = process.kill, childrenOf = descendantPids } = {}) {
    if (!pid) {
        return;
    }
    for (const id of [...childrenOf(pid)].reverse()) {
        try {
            kill(id, signal);
        } catch {
            // Already gone.
        }
    }
    try {
        kill(pid, signal);
    } catch {
        // Already gone.
    }
}

function appendLog(logs, line) {
    if (!logs) {
        return line;
    }
    return logs.endsWith('\n') ? logs + line : `${logs}\n${line}`;
}

const NPM_ENV_NOISE = new Set([
    'npm_config_devdir',
    'NPM_CONFIG_DEVDIR',
    'npm_config_cache',
    'NPM_CONFIG_CACHE',
]);

export function scanEnv(extra = {}, source = process.env) {
    const env = { ...source };
    for (const key of NPM_ENV_NOISE) {
        delete env[key];
    }
    return {
        ...env,
        FORCE_COLOR: '0',
        PLAYWRIGHT_HTML_OPEN: 'never',
        PLAYWRIGHT_JSON_OUTPUT_NAME: 'playwright-report/playwright_results.json',
        PLAYWRIGHT_NO_SANDBOX: '1',
        ...extra,
    };
}

export function createRunner({
    spawn = defaultSpawn,
    suites = defaultSuites,
    cwd = process.cwd(),
    tee = process,
    hungAfterMs = envMs('ADA_SCANNER_HUNG_MS', defaultHungAfterMs),
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
} = {}) {
    let child = null;
    let current = idleRun();
    let hungTimer = null;
    let runToken = 0;
    let hungGeneration = 0;

    function clearHungTimer() {
        hungGeneration += 1;
        if (hungTimer == null) {
            return;
        }
        clearTimer(hungTimer);
        hungTimer = null;
    }

    function armHungTimer(running, token) {
        clearHungTimer();
        if (!(hungAfterMs > 0) || child !== running) {
            return;
        }
        const thisHung = hungGeneration;
        const timer = setTimer(() => {
            if (thisHung !== hungGeneration || child !== running || token !== runToken) {
                return;
            }
            stop({ hung: true });
        }, hungAfterMs);
        timer?.unref?.();
        hungTimer = timer;
    }

    function stop({ hung = false } = {}) {
        if (!child) {
            return { ok: true, stopped: false };
        }

        const running = child;
        child = null;
        clearHungTimer();
        if (running.pid) {
            killProcessTree(running.pid);
            const killer = setTimer(() => {
                killProcessTree(running.pid, { signal: 'SIGKILL' });
            }, 1000);
            killer?.unref?.();
        } else {
            running.kill?.('SIGTERM');
        }

        const message = hung
            ? `Scan stopped: hung (no Playwright output for ${Math.round(hungAfterMs / 1000)}s).\n`
            : 'Scan stopped.\n';
        current = {
            ...current,
            status: 'finished',
            code: null,
            finishedAt: new Date(now()).toISOString(),
            stopped: true,
            hung,
            logs: appendLog(current.logs, message),
        };
        return { ok: true, stopped: true, hung };
    }

    return {
        listSuites() {
            return suites.map(({ id, label, script, baseURL }) => ({ id, label, script, baseURL }));
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

            const testFile = suite.testFile || 'tests/site.test.ts';
            const running = spawn('npx', ['playwright', 'test', testFile], {
                cwd,
                env: scanEnv({ SITE_ID: suite.id }),
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            child = running;
            const token = ++runToken;
            current = {
                id,
                status: 'running',
                code: null,
                logs: '',
                startedAt: new Date(now()).toISOString(),
                finishedAt: null,
                stopped: false,
                hung: false,
            };
            armHungTimer(running, token);

            const output = new EventEmitter();
            const emitChunk = (chunk) => {
                const text = normalizeOutput(chunk.toString());
                if (!text) {
                    return;
                }
                current.logs += text;
                output.emit('data', text);
                armHungTimer(running, token);
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
                    if (token !== runToken) {
                        resolve({ code });
                        return;
                    }
                    clearHungTimer();
                    if (child === running) {
                        child = null;
                    }
                    current = {
                        ...current,
                        status: 'finished',
                        code,
                        finishedAt: new Date(now()).toISOString(),
                    };
                    resolve({ code });
                };
                running.once('exit', finish);
                running.once('error', () => finish(1));
            });

            return { ok: true, suite, done, output };
        },
        stop,
    };
}

function normalizeOutput(text) {
    return stripAnsi(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
