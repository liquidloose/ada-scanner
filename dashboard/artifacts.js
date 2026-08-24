import { access, readdir, readFile, rm, stat, unlink } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

export const spreadsheetMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function reportAvailable(reportDir) {
    try {
        await access(path.join(reportDir, 'index.html'), fsConstants.R_OK);
        return true;
    } catch {
        return false;
    }
}

export async function deleteReport(reportDir) {
    if (!(await reportAvailable(reportDir))) {
        return { ok: false, reason: 'no-report' };
    }
    const root = path.resolve(reportDir);
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { ok: false, reason: 'no-report' };
        }
        throw error;
    }
    for (const entry of entries) {
        const target = path.resolve(root, entry.name);
        if (!isInside(root, target)) {
            continue;
        }
        await rm(target, { recursive: true, force: true });
    }
    return { ok: true };
}

export function isInside(root, filePath) {
    const relative = path.relative(root, filePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function spreadsheetFileName(raw) {
    if (!raw || raw.includes('\0')) {
        return null;
    }
    const name = path.basename(raw);
    if (name !== raw || path.extname(name).toLowerCase() !== '.xlsx' || name.startsWith('.')) {
        return null;
    }
    return name;
}

export async function resolveSpreadsheet(spreadsheetsDir, raw) {
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

export async function resolveSpreadsheets(spreadsheetsDir, names) {
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

export async function listSpreadsheets(spreadsheetsDir) {
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

export async function deleteSpreadsheet(spreadsheetsDir, raw) {
    const resolved = await resolveSpreadsheet(spreadsheetsDir, raw);
    if (!resolved.ok) {
        return resolved;
    }
    await unlink(resolved.filePath);
    return { ok: true, name: resolved.name };
}

export async function deleteSpreadsheets(spreadsheetsDir, names) {
    const resolved = await resolveSpreadsheets(spreadsheetsDir, names);
    if (!resolved.ok) {
        return resolved;
    }
    const deleted = [];
    for (const file of resolved.files) {
        await unlink(file.filePath);
        deleted.push(file.name);
    }
    return { ok: true, deleted };
}

const mimeByExt = {
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
    '.txt': 'text/plain; charset=utf-8',
    '.xlsx': spreadsheetMime,
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

export async function collectScanFiles({ reportDir, spreadsheetsDir, allureReportsDir, logs = '' } = {}) {
    const files = [];
    for (const sheet of await listSpreadsheets(spreadsheetsDir)) {
        files.push({
            kind: 'spreadsheet',
            name: `spreadsheets/${sheet.name}`,
            mime: spreadsheetMime,
            data: await readFile(sheet.path),
        });
    }
    files.push(...(await collectTree(reportDir, 'report', 'report')));
    files.push(...(await collectAllureReports(allureReportsDir)));
    if (typeof logs === 'string' && logs.length > 0) {
        files.push({
            kind: 'log',
            name: 'scan-output.txt',
            mime: mimeByExt['.txt'],
            data: Buffer.from(logs, 'utf8'),
        });
    }
    return files;
}

async function collectAllureReports(reportsDir) {
    if (!reportsDir) {
        return [];
    }
    let entries;
    try {
        entries = await readdir(reportsDir, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    const files = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const dir = path.join(reportsDir, entry.name);
        if (!(await reportAvailable(dir))) {
            continue;
        }
        files.push(...(await collectTree(dir, `allure/${entry.name}`, 'allure')));
    }
    return files;
}

async function collectTree(root, prefix, kind = 'report') {
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    const files = [];
    for (const entry of entries) {
        const relative = `${prefix}/${entry.name}`;
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectTree(full, relative, kind)));
            continue;
        }
        if (!entry.isFile()) {
            continue;
        }
        files.push({
            kind,
            name: relative,
            mime: mimeByExt[path.extname(entry.name).toLowerCase()] ?? 'application/octet-stream',
            data: await readFile(full),
        });
    }
    return files;
}
