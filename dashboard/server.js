import { createServer as createHttpServer } from 'node:http';
import { access, readdir, readFile, stat, unlink } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { errorBody, errorStatus } from './errors.js';
import { createOpenApiSpec } from './openapi.js';
import { createRunner } from './runner.js';

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.dirname(dashboardDir);
const defaultReportDir = path.join(uiDir, 'playwright-report');
const defaultSpreadsheetsDir = path.join(uiDir, 'spreadsheets');
const spreadsheetMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.zip': 'application/zip',
    '.webm': 'video/webm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.xlsx': spreadsheetMime,
};

export function createDashboardServer({
    runner = createRunner(),
    port = 0,
    reportDir = defaultReportDir,
    spreadsheetsDir = defaultSpreadsheetsDir,
    fallback = null,
} = {}) {
    const server = createHttpServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

            if (req.method === 'GET' && url.pathname === '/openapi.json') {
                json(res, 200, createOpenApiSpec({ port: addressPort(server) }));
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api') {
                json(res, 200, apiIndex());
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api/suites') {
                json(res, 200, { suites: runner.listSuites(), busy: runner.isBusy() });
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api/report') {
                json(res, 200, {
                    available: await reportAvailable(reportDir),
                    href: '/report/',
                    download: '/api/report/download',
                });
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api/report/download') {
                await sendReportDownload(res, reportDir);
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api/spreadsheets') {
                json(res, 200, { files: await listSpreadsheets(spreadsheetsDir) });
                return;
            }

            if (req.method === 'POST' && url.pathname === '/api/spreadsheets/download') {
                await sendSpreadsheetBatchDownload(res, spreadsheetsDir, await readJson(req));
                return;
            }

            if (req.method === 'POST' && url.pathname === '/api/spreadsheets/delete') {
                await deleteSpreadsheets(res, spreadsheetsDir, await readJson(req));
                return;
            }

            if (url.pathname.startsWith('/api/spreadsheets/')) {
                const name = decodeURIComponent(url.pathname.slice('/api/spreadsheets/'.length));
                if (req.method === 'GET') {
                    await sendSpreadsheetDownload(res, spreadsheetsDir, name);
                    return;
                }
                if (req.method === 'DELETE') {
                    await deleteSpreadsheet(res, spreadsheetsDir, name);
                    return;
                }
            }

            if (req.method === 'POST' && url.pathname === '/api/runs') {
                const body = await readJson(req);
                const result = runner.start(body.id);
                if (!result.ok) {
                    json(res, errorStatus(result.reason), { ...errorBody(result.reason), busy: runner.isBusy() });
                    return;
                }
                json(res, 202, { ok: true, id: body.id, status: 'running' });
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api/runs/current') {
                json(res, 200, {
                    ...runner.getCurrent(),
                    report: await reportAvailable(reportDir),
                });
                return;
            }

            if (req.method === 'POST' && url.pathname === '/api/run') {
                const body = await readJson(req);
                const result = runner.start(body.id);
                if (!result.ok) {
                    json(res, errorStatus(result.reason), { ...errorBody(result.reason), busy: runner.isBusy() });
                    return;
                }
                await streamRun(res, body.id, result, reportDir);
                return;
            }

            if (req.method === 'GET' && (url.pathname === '/report' || url.pathname.startsWith('/report/'))) {
                await sendReport(res, url.pathname, reportDir);
                return;
            }

            if (req.method === 'GET' && url.pathname === '/report-theme.css') {
                await sendFile(res, path.join(dashboardDir, 'report-theme.css'));
                return;
            }

            if (fallback) {
                fallback(req, res);
                return;
            }

            if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
                await sendFile(res, path.join(uiDir, 'index.html'));
                return;
            }

            if (req.method === 'GET') {
                res.writeHead(404);
                res.end();
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
            json(res, 500, errorBody('error'));
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

async function streamRun(res, id, result, reportDir) {
    res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
    });
    res.flushHeaders?.();
    writeEvent(res, { type: 'start', id });

    const canWrite = () => !res.destroyed && !res.writableEnded;
    const onData = (text) => {
        if (canWrite()) {
            writeEvent(res, { type: 'log', text });
        }
    };
    result.output.on('data', onData);

    try {
        const finished = await result.done;
        if (canWrite()) {
            writeEvent(res, {
                type: 'done',
                ok: true,
                id,
                code: finished.code,
                busy: false,
                report: await reportAvailable(reportDir),
            });
        }
    } finally {
        result.output.off('data', onData);
        if (!res.writableEnded) {
            res.end();
        }
    }
}

function writeEvent(res, payload) {
    res.write(`${JSON.stringify(payload)}\n`);
}

async function reportAvailable(reportDir) {
    try {
        await access(path.join(reportDir, 'index.html'), fsConstants.R_OK);
        return true;
    } catch {
        return false;
    }
}

function isInside(root, filePath) {
    const relative = path.relative(root, filePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function sendReport(res, pathname, reportDir) {
    const root = path.resolve(reportDir);
    const relative =
        pathname === '/report' || pathname === '/report/'
            ? 'index.html'
            : decodeURIComponent(pathname.slice('/report/'.length));
    const filePath = path.resolve(root, relative);
    if (!isInside(root, filePath)) {
        res.writeHead(403);
        res.end();
        return;
    }

    let target = filePath;
    const info = await stat(filePath);
    if (info.isDirectory()) {
        target = path.join(filePath, 'index.html');
        if (!isInside(root, target)) {
            res.writeHead(403);
            res.end();
            return;
        }
    }
    if (path.basename(target) === 'index.html') {
        const html = applyReportTheme(await readFile(target, 'utf8'));
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
    }
    await sendFile(res, target);
}

function applyReportTheme(html, themeCss = null) {
    let themed = html.replace(/content=(['"])dark light\1/, "content='light'");
    const snippet = themeCss
        ? `<style id="ada-report-theme">${themeCss}</style>`
        : '<link rel="stylesheet" href="/report-theme.css">';
    if (themeCss) {
        themed = themed.replace(/<link rel="stylesheet" href="\/report-theme\.css">/g, '');
    } else if (themed.includes('report-theme.css')) {
        return themed;
    }
    if (themed.includes('</head>')) {
        return themed.replace('</head>', `${snippet}</head>`);
    }
    return `${snippet}${themed}`;
}

async function sendReportDownload(res, reportDir) {
    if (!(await reportAvailable(reportDir))) {
        json(res, 404, errorBody('no-report'));
        return;
    }
    const [html, themeCss] = await Promise.all([
        readFile(path.join(reportDir, 'index.html'), 'utf8'),
        readFile(path.join(dashboardDir, 'report-theme.css'), 'utf8'),
    ]);
    const body = applyReportTheme(html, themeCss);
    res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-disposition': 'attachment; filename="playwright-report.html"',
        'content-length': Buffer.byteLength(body),
    });
    res.end(body);
}

function spreadsheetFileName(raw) {
    if (!raw || raw.includes('\0')) {
        return null;
    }
    const name = path.basename(raw);
    if (name !== raw || path.extname(name).toLowerCase() !== '.xlsx' || name.startsWith('.')) {
        return null;
    }
    return name;
}

async function resolveSpreadsheet(spreadsheetsDir, raw) {
    const name = spreadsheetFileName(raw);
    if (!name) {
        return { ok: false, reason: 'invalid' };
    }
    const root = path.resolve(spreadsheetsDir);
    const filePath = path.resolve(root, name);
    if (!isInside(root, filePath)) {
        return { ok: false, reason: 'invalid' };
    }
    try {
        const info = await stat(filePath);
        if (!info.isFile()) {
            return { ok: false, reason: 'missing' };
        }
        return { ok: true, name, filePath, info };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { ok: false, reason: 'missing' };
        }
        throw error;
    }
}

async function listSpreadsheets(spreadsheetsDir) {
    let entries;
    try {
        entries = await readdir(spreadsheetsDir, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }

    const files = [];
    for (const entry of entries) {
        if (!entry.isFile() || spreadsheetFileName(entry.name) == null) {
            continue;
        }
        const info = await stat(path.join(spreadsheetsDir, entry.name));
        files.push({
            name: entry.name,
            size: info.size,
            mtime: info.mtime.toISOString(),
            href: `/api/spreadsheets/${encodeURIComponent(entry.name)}`,
            path: path.resolve(spreadsheetsDir, entry.name),
        });
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    return files;
}

async function sendSpreadsheetDownload(res, spreadsheetsDir, raw) {
    const resolved = await resolveSpreadsheet(spreadsheetsDir, raw);
    if (!resolved.ok) {
        json(res, errorStatus(resolved.reason), errorBody(resolved.reason));
        return;
    }
    const data = await readFile(resolved.filePath);
    res.writeHead(200, {
        'content-type': spreadsheetMime,
        'content-disposition': `attachment; filename="${resolved.name}"`,
        'content-length': data.length,
    });
    res.end(data);
}

async function deleteSpreadsheet(res, spreadsheetsDir, raw) {
    const resolved = await resolveSpreadsheet(spreadsheetsDir, raw);
    if (!resolved.ok) {
        json(res, errorStatus(resolved.reason), errorBody(resolved.reason));
        return;
    }
    await unlink(resolved.filePath);
    json(res, 200, { ok: true, name: resolved.name });
}

async function resolveSpreadsheets(spreadsheetsDir, names) {
    if (!Array.isArray(names) || names.length === 0) {
        return { ok: false, reason: 'no-selection' };
    }
    const unique = [...new Set(names)];
    const files = [];
    for (const raw of unique) {
        const resolved = await resolveSpreadsheet(spreadsheetsDir, raw);
        if (!resolved.ok) {
            return { ok: false, reason: resolved.reason };
        }
        files.push(resolved);
    }
    return { ok: true, files };
}

async function sendSpreadsheetBatchDownload(res, spreadsheetsDir, body) {
    const resolved = await resolveSpreadsheets(spreadsheetsDir, body.names);
    if (!resolved.ok) {
        json(res, errorStatus(resolved.reason), errorBody(resolved.reason));
        return;
    }
    if (resolved.files.length === 1) {
        await sendSpreadsheetDownload(res, spreadsheetsDir, resolved.files[0].name);
        return;
    }
    const entries = await Promise.all(
        resolved.files.map(async (file) => ({
            name: file.name,
            data: await readFile(file.filePath),
        }))
    );
    const zip = createZipStore(entries);
    res.writeHead(200, {
        'content-type': 'application/zip',
        'content-disposition': 'attachment; filename="spreadsheets.zip"',
        'content-length': zip.length,
    });
    res.end(zip);
}

async function deleteSpreadsheets(res, spreadsheetsDir, body) {
    const resolved = await resolveSpreadsheets(spreadsheetsDir, body.names);
    if (!resolved.ok) {
        json(res, errorStatus(resolved.reason), errorBody(resolved.reason));
        return;
    }
    const deleted = [];
    for (const file of resolved.files) {
        await unlink(file.filePath);
        deleted.push(file.name);
    }
    json(res, 200, { ok: true, deleted });
}

function createZipStore(files) {
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const file of files) {
        const name = Buffer.from(file.name, 'utf8');
        const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
        const crc = crc32(data) >>> 0;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(dosTime, 10);
        local.writeUInt16LE(dosDate, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(dosTime, 12);
        central.writeUInt16LE(dosDate, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);

        locals.push(local, name, data);
        centrals.push(central, name);
        offset += local.length + name.length + data.length;
    }

    const centralDir = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralDir.length, 12);
    eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralDir, eocd]);
}

function addressPort(server) {
    const address = server.address();
    return address && typeof address === 'object' ? address.port : Number(process.env.PORT) || 3847;
}

function apiIndex() {
    const spec = createOpenApiSpec();
    const operations = [];
    for (const [pathname, methods] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
            operations.push({
                operationId: operation.operationId,
                method: method.toUpperCase(),
                path: pathname,
                summary: operation.summary,
            });
        }
    }
    return {
        name: 'ADA Scanner API',
        openapi: '/openapi.json',
        operations,
    };
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
    const { createServer: createViteServer } = await import('vite');
    const port = Number(process.env.PORT) || 3847;
    let vite;
    const dashboard = createDashboardServer({
        port,
        fallback(req, res) {
            vite.middlewares(req, res, () => {
                res.writeHead(404);
                res.end();
            });
        },
    });
    vite = await createViteServer({
        configFile: path.join(uiDir, 'vite.config.ts'),
        server: {
            middlewareMode: true,
            hmr: { server: dashboard.server },
        },
        appType: 'spa',
    });
    const address = await dashboard.listen();
    console.log(`Scan launcher: http://127.0.0.1:${address.port}`);
}
