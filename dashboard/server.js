import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunner } from './runner.js';

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
};

export function createDashboardServer({ runner = createRunner(), port = 0 } = {}) {
    const server = createHttpServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

            if (req.method === 'GET' && url.pathname === '/api/suites') {
                json(res, 200, { suites: runner.listSuites(), busy: runner.isBusy() });
                return;
            }

            if (req.method === 'POST' && url.pathname === '/api/run') {
                const body = await readJson(req);
                const result = runner.start(body.id);
                if (!result.ok) {
                    const status = result.reason === 'busy' ? 409 : 400;
                    json(res, status, { ok: false, reason: result.reason, busy: runner.isBusy() });
                    return;
                }
                const finished = await result.done;
                json(res, 200, { ok: true, id: body.id, code: finished.code, busy: false });
                return;
            }

            if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
                await sendFile(res, path.join(dashboardDir, 'index.html'));
                return;
            }

            if (req.method === 'GET') {
                const relative = path.normalize(url.pathname).replace(/^[/\\]+/, '');
                const filePath = path.join(dashboardDir, relative);
                if (!filePath.startsWith(dashboardDir)) {
                    res.writeHead(403);
                    res.end();
                    return;
                }
                await sendFile(res, filePath);
                return;
            }

            res.writeHead(405);
            res.end();
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end();
                return;
            }
            json(res, 500, { ok: false, reason: 'error' });
        }
    });

    return {
        listen() {
            return new Promise((resolve) => {
                server.listen(port, '127.0.0.1', () => resolve(server.address()));
            });
        },
        close() {
            return new Promise((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
            });
        },
        server,
    };
}

async function readJson(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    if (chunks.length === 0) {
        return {};
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function json(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
    });
    res.end(body);
}

async function sendFile(res, filePath) {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'content-type': mimeTypes[ext] ?? 'application/octet-stream' });
    res.end(data);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const port = Number(process.env.PORT) || 3847;
    const dashboard = createDashboardServer({ port });
    const address = await dashboard.listen();
    console.log(`Scan launcher: http://127.0.0.1:${address.port}`);
}
