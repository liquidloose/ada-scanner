import { createServer as createHttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import {
    isInside,
    reportAvailable,
    spreadsheetMime,
} from './artifacts.js';
import { errorBody } from './errors.js';
import { createMcpHttpHandler } from './mcp-http.js';
import { scannerTools } from './mcp.js';
import { createOpenApiSpec } from './openapi.js';
import { assertLicense } from './license.js';
import { createRunner } from './runner.js';
import { createScannerService, defaultReportDir, defaultSpreadsheetsDir } from './service.js';

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.dirname(dashboardDir);

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
    runner,
    service,
    port = 0,
    host = process.env.ADA_SCANNER_HOST || '127.0.0.1',
    reportDir = defaultReportDir,
    spreadsheetsDir = defaultSpreadsheetsDir,
    fallback = null,
} = {}) {
    const scanner =
        service ??
        createScannerService({
            runner: runner ?? createRunner(),
            reportDir,
            spreadsheetsDir,
        });
    const mcpHttp = createMcpHttpHandler(scanner);

    const server = createHttpServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

            if (url.pathname === '/mcp') {
                const body = req.method === 'POST' ? await readJson(req) : undefined;
                await mcpHttp.handle(req, res, body);
                return;
            }

            if (req.method === 'GET' && url.pathname === '/openapi.json') {
                json(res, 200, createOpenApiSpec({ port: addressPort(server) }));
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api') {
                json(res, 200, apiIndex());
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api/health') {
                const result = scanner.getHealth();
                json(res, result.status, result.data);
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api/suites') {
                const result = scanner.listSuites();
                json(res, result.status, result.data);
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api/report') {
                const result = await scanner.getReportStatus();
                json(res, result.status, result.data);
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api/report/download') {
                await sendReportDownload(res, reportDir);
                return;
            }

            if (req.method === 'DELETE' && url.pathname === '/api/report') {
                const result = await scanner.deleteReport();
                json(res, result.status, result.data);
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api/spreadsheets') {
                const result = await scanner.listSpreadsheets();
                json(res, result.status, result.data);
                return;
            }

            if (req.method === 'POST' && url.pathname === '/api/spreadsheets/combine') {
                const result = scanner.combineSpreadsheets();
                json(res, result.status, result.data);
                return;
            }

            if (req.method === 'POST' && url.pathname === '/api/spreadsheets/download') {
                await sendSpreadsheetBatchDownload(res, scanner, await readJson(req));
                return;
            }

            if (req.method === 'POST' && url.pathname === '/api/spreadsheets/delete') {
                const result = await scanner.deleteSpreadsheets((await readJson(req)).names);
                json(res, result.status, result.data);
                return;
            }

            if (url.pathname.startsWith('/api/spreadsheets/')) {
                const name = decodeURIComponent(url.pathname.slice('/api/spreadsheets/'.length));
                if (req.method === 'GET') {
                    await sendSpreadsheetDownload(res, scanner, name);
                    return;
                }
                if (req.method === 'DELETE') {
                    const result = await scanner.deleteSpreadsheet(name);
                    json(res, result.status, result.data);
                    return;
                }
            }

            if (req.method === 'POST' && url.pathname === '/api/runs') {
                const body = await readJson(req);
                const result = scanner.startRun(body.id);
                json(res, result.status, result.data);
                return;
            }

            if (req.method === 'GET' && url.pathname === '/api/runs/current') {
                const result = await scanner.getCurrentRun();
                json(res, result.status, result.data);
                return;
            }

            if (req.method === 'POST' && url.pathname === '/api/runs/current/stop') {
                const result = await scanner.stopRun();
                json(res, result.status, result.data);
                return;
            }

            if (req.method === 'POST' && url.pathname === '/api/run') {
                const body = await readJson(req);
                const result = scanner.startRun(body.id);
                if (!result.ok) {
                    json(res, result.status, result.data);
                    return;
                }
                await streamRun(res, body.id, result.result, reportDir);
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
                server.listen(port, host, () => resolve(server.address()));
            });
        },
        close() {
            return new Promise((resolve, reject) => {
                mcpHttp.close().finally(() => {
                    server.close((err) => (err ? reject(err) : resolve()));
                });
            });
        },
        server,
        service: scanner,
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

async function sendSpreadsheetDownload(res, scanner, raw) {
    const resolved = await scanner.resolveSpreadsheet(raw);
    if (!resolved.ok) {
        json(res, resolved.status, resolved.data);
        return;
    }
    const data = await readFile(resolved.data.filePath);
    res.writeHead(200, {
        'content-type': spreadsheetMime,
        'content-disposition': `attachment; filename="${resolved.data.name}"`,
        'content-length': data.length,
    });
    res.end(data);
}

async function sendSpreadsheetBatchDownload(res, scanner, body) {
    const resolved = await scanner.resolveSpreadsheets(body.names);
    if (!resolved.ok) {
        json(res, resolved.status, resolved.data);
        return;
    }
    if (resolved.data.files.length === 1) {
        await sendSpreadsheetDownload(res, scanner, resolved.data.files[0].name);
        return;
    }
    const entries = await Promise.all(
        resolved.data.files.map(async (file) => ({
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
        mcp: '/mcp',
        operations,
        tools: scannerTools,
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

async function sendStaticUi(req, res, distDir) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end();
        return;
    }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const filePath = path.resolve(distDir, relative);
    if (!isInside(distDir, filePath)) {
        res.writeHead(403);
        res.end();
        return;
    }
    try {
        await sendFile(res, filePath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await sendFile(res, path.join(distDir, 'index.html'));
            return;
        }
        throw error;
    }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    assertLicense();
    const port = Number(process.env.PORT) || 3847;
    const host = process.env.ADA_SCANNER_HOST || '127.0.0.1';
    const distDir = path.join(uiDir, 'dist');
    const useDist =
        process.env.ADA_SCANNER_UI === 'static' ||
        (process.env.NODE_ENV === 'production' && existsSync(path.join(distDir, 'index.html')));

    let dashboard;
    if (useDist) {
        dashboard = createDashboardServer({
            port,
            host,
            fallback(req, res) {
                sendStaticUi(req, res, distDir).catch(() => {
                    res.writeHead(404);
                    res.end();
                });
            },
        });
    } else {
        const { createServer: createViteServer } = await import('vite');
        let vite;
        dashboard = createDashboardServer({
            port,
            host,
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
    }
    const address = await dashboard.listen();
    const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
    console.log(`Scan launcher: http://${displayHost}:${address.port}`);
    console.log(`MCP:            http://${displayHost}:${address.port}/mcp`);
}
