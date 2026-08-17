import { access, readdir, rm, stat, unlink } from 'node:fs/promises';
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
