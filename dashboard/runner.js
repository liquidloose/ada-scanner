import { spawn as defaultSpawn } from 'node:child_process';
import { suites as defaultSuites } from './suites.js';

export function createRunner({ spawn = defaultSpawn, suites = defaultSuites, cwd = process.cwd() } = {}) {
    let child = null;

    return {
        listSuites() {
            return suites.map(({ id, label, script }) => ({ id, label, script }));
        },
        isBusy() {
            return child != null;
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
                env: process.env,
                stdio: 'inherit',
            });
            child = running;

            const done = new Promise((resolve) => {
                const finish = (code) => {
                    if (child === running) {
                        child = null;
                    }
                    resolve({ code });
                };
                running.once('exit', finish);
                running.once('error', () => finish(1));
            });

            return { ok: true, suite, done };
        },
    };
}
