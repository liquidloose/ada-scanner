import { spawn as defaultSpawn } from 'node:child_process';
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isInside, reportAvailable } from './artifacts.js';

const uiDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const defaultAllureBin = path.join(uiDir, 'node_modules', '.bin', 'allure');
export const metaFileName = 'ada-meta.json';

export function allureReportId(suiteId, now = new Date()) {
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const site = String(suiteId || 'scan')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${site || 'scan'}-${stamp}`;
}

function allureRunStamp(id) {
    const match = String(id).match(/(\d{4}-\d{2}-\d{2}T[\d-]+Z)$/);
    return match ? match[1] : '';
}

export function allureReportName(raw) {
    if (!raw || typeof raw !== 'string' || raw.includes('\0')) {
        return null;
    }
    const name = path.basename(raw);
    if (name !== raw || name.startsWith('.') || !/^[a-zA-Z0-9._-]+$/.test(name)) {
        return null;
    }
    return name;
}

async function hasResultJson(dir) {
    let entries;
    try {
        entries = await readdir(dir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
    return entries.some((name) => name.endsWith('-result.json'));
}

export async function resolveAllureResultsDir(resultsDir) {
    let entries;
    try {
        entries = await readdir(resultsDir, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }

    const runs = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const id = allureReportName(entry.name);
        if (!id) {
            continue;
        }
        const full = path.join(resultsDir, id);
        if (!(await hasResultJson(full))) {
            continue;
        }
        const info = await stat(full);
        runs.push({ dir: full, time: info.mtimeMs, stamp: allureRunStamp(id) });
    }
    if (runs.length) {
        runs.sort((a, b) => b.stamp.localeCompare(a.stamp) || b.time - a.time || b.dir.localeCompare(a.dir));
        return runs[0].dir;
    }
    if (await hasResultJson(resultsDir)) {
        return resultsDir;
    }
    return null;
}

export async function allureResultsAvailable(resultsDir) {
    return (await resolveAllureResultsDir(resultsDir)) != null;
}

export async function listAllureReports(reportsDir) {
    let entries;
    try {
        entries = await readdir(reportsDir, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }

    const reports = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const id = allureReportName(entry.name);
        if (!id) {
            continue;
        }
        if (!(await reportAvailable(path.join(reportsDir, id)))) {
            continue;
        }
        reports.push(await summarize(reportsDir, id));
    }
    reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return reports;
}

export async function resolveAllureFile(reportsDir, rawId, relative = 'index.html') {
    const id = allureReportName(rawId);
    if (!id) {
        return { ok: false, reason: 'invalid' };
    }
    const root = path.resolve(reportsDir, id);
    const reportsRoot = path.resolve(reportsDir);
    if (!isInside(reportsRoot, root)) {
        return { ok: false, reason: 'invalid' };
    }
    if (!(await reportAvailable(root))) {
        return { ok: false, reason: 'missing' };
    }

    const segment = String(relative || 'index.html').replace(/^\/+/, '') || 'index.html';
    const filePath = path.resolve(root, segment);
    if (!isInside(root, filePath)) {
        return { ok: false, reason: 'invalid' };
    }

    let target = filePath;
    try {
        const info = await stat(filePath);
        if (info.isDirectory()) {
            target = path.join(filePath, 'index.html');
            if (!isInside(root, target)) {
                return { ok: false, reason: 'invalid' };
            }
        }
        await access(target, fsConstants.R_OK);
        return { ok: true, id, filePath: target };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { ok: false, reason: 'missing' };
        }
        throw error;
    }
}

export async function clearDirectory(dir) {
    const root = path.resolve(dir);
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { ok: true };
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

export async function clearAllureData(resultsDir, reportsDir) {
    await clearDirectory(resultsDir);
    await clearDirectory(reportsDir);
    return { ok: true };
}

export async function deleteAllureReport(reportsDir, rawId) {
    const id = allureReportName(rawId);
    if (!id) {
        return { ok: false, reason: 'invalid' };
    }
    const root = path.resolve(reportsDir, id);
    if (!isInside(path.resolve(reportsDir), root)) {
        return { ok: false, reason: 'invalid' };
    }
    if (!(await reportAvailable(root))) {
        return { ok: false, reason: 'missing' };
    }
    await rm(root, { recursive: true, force: true });
    return { ok: true, id };
}

export async function generateAllureReport({
    resultsDir,
    reportsDir,
    suiteId = null,
    siteUrl = null,
    spawn = defaultSpawn,
    allureBin = defaultAllureBin,
    now = new Date(),
    cwd = uiDir,
} = {}) {
    const inputDir = await resolveAllureResultsDir(resultsDir);
    if (!inputDir) {
        return { ok: false, reason: 'no-allure-results' };
    }

    const id = allureReportId(suiteId, now);
    const outputDir = path.join(reportsDir, id);
    await mkdir(outputDir, { recursive: true });

    const generated = await runAllure(spawn, allureBin, inputDir, outputDir, cwd);
    if (!generated.ok) {
        await rm(outputDir, { recursive: true, force: true });
        return generated;
    }
    if (!(await reportAvailable(outputDir))) {
        await rm(outputDir, { recursive: true, force: true });
        return { ok: false, reason: 'allure-failed' };
    }

    const createdAt = now.toISOString();
    await writeFile(
        path.join(outputDir, metaFileName),
        JSON.stringify({ suiteId, siteUrl, createdAt })
    );
    return { ok: true, report: await summarize(reportsDir, id) };
}

function runAllure(spawn, allureBin, resultsDir, outputDir, cwd) {
    return new Promise((resolve) => {
        const child = spawn(allureBin, ['generate', resultsDir, '-o', outputDir], { cwd });
        child.once('error', () => resolve({ ok: false, reason: 'allure-failed' }));
        child.once('exit', (code) => {
            resolve(code === 0 ? { ok: true } : { ok: false, reason: 'allure-failed' });
        });
    });
}

async function summarize(reportsDir, id) {
    const dir = path.join(reportsDir, id);
    const info = await stat(dir);
    let meta = {};
    try {
        meta = JSON.parse(await readFile(path.join(dir, metaFileName), 'utf8'));
    } catch {
        // Folder name and mtime are enough to list a report.
    }
    return {
        id,
        createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : info.mtime.toISOString(),
        suiteId: meta.suiteId ?? null,
        siteUrl: meta.siteUrl ?? null,
        size: await directorySize(dir),
        href: `/allure/${encodeURIComponent(id)}/`,
    };
}

async function directorySize(root) {
    const entries = await readdir(root, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            total += await directorySize(full);
            continue;
        }
        if (entry.isFile()) {
            total += (await stat(full)).size;
        }
    }
    return total;
}
