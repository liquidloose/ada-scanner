import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    deleteSpreadsheet as deleteSpreadsheetFile,
    deleteSpreadsheets as deleteSpreadsheetFiles,
    deleteReport as removeReport,
    listSpreadsheets as listSpreadsheetFiles,
    reportAvailable,
    resolveSpreadsheet,
    resolveSpreadsheets,
} from './artifacts.js';
import { errorBody, errorStatus } from './errors.js';
import { createRunner } from './runner.js';
import { combineSpreadsheets as writeCombinedSpreadsheets } from '../utils/combine-sheets.js';

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.dirname(dashboardDir);
export const defaultReportDir = path.join(uiDir, 'playwright-report');
export const defaultSpreadsheetsDir = path.join(uiDir, 'spreadsheets');

export function fail(reason, extra = {}) {
    return {
        ok: false,
        status: errorStatus(reason),
        data: { ...errorBody(reason), ...extra },
    };
}

export function ok(data, status = 200, extra = {}) {
    return { ok: true, status, data, ...extra };
}

export async function waitForRun(getCurrentRun, { timeoutMs = 600_000, intervalMs = 500 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
        const snapshot = await getCurrentRun();
        if (snapshot.data.status !== 'running') {
            return snapshot;
        }
        if (Date.now() >= deadline) {
            return fail('timeout', snapshot.data);
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
}

export function createScannerService({
    runner = createRunner(),
    reportDir = defaultReportDir,
    spreadsheetsDir = defaultSpreadsheetsDir,
} = {}) {
    const service = {
        getHealth() {
            return ok({
                ok: true,
                name: 'ADA Scanner',
                mcp: '/mcp',
                ui: '/',
            });
        },
        listSuites() {
            return ok({
                suites: runner.listSuites(),
                busy: runner.isBusy(),
            });
        },
        startRun(id) {
            const result = runner.start(id);
            if (!result.ok) {
                return fail(result.reason, { busy: runner.isBusy() });
            }
            return ok({ ok: true, id, status: 'running' }, 202, { result });
        },
        async getCurrentRun() {
            return ok({
                ...runner.getCurrent(),
                report: await reportAvailable(reportDir),
            });
        },
        async waitForRun(options) {
            return waitForRun(() => service.getCurrentRun(), options);
        },
        async getReportStatus() {
            const available = await reportAvailable(reportDir);
            return ok({
                available,
                href: '/report/',
                download: '/api/report/download',
                path: available ? path.resolve(reportDir, 'index.html') : null,
            });
        },
        async deleteReport() {
            if (runner.isBusy()) {
                return fail('busy', { busy: true });
            }
            const deleted = await removeReport(reportDir);
            if (!deleted.ok) {
                return fail(deleted.reason);
            }
            return ok({ ok: true, available: false });
        },
        async listSpreadsheets() {
            return ok({ files: await listSpreadsheetFiles(spreadsheetsDir) });
        },
        combineSpreadsheets() {
            if (runner.isBusy()) {
                return fail('busy', { busy: true });
            }
            const combined = writeCombinedSpreadsheets(spreadsheetsDir);
            if (!combined.ok) {
                return fail(combined.reason);
            }
            return ok({ ok: true, ...combined });
        },
        async resolveSpreadsheet(name) {
            const resolved = await resolveSpreadsheet(spreadsheetsDir, name);
            if (!resolved.ok) {
                return fail(resolved.reason);
            }
            return ok(resolved);
        },
        async resolveSpreadsheets(names) {
            const resolved = await resolveSpreadsheets(spreadsheetsDir, names);
            if (!resolved.ok) {
                return fail(resolved.reason);
            }
            return ok(resolved);
        },
        async deleteSpreadsheet(name) {
            const deleted = await deleteSpreadsheetFile(spreadsheetsDir, name);
            if (!deleted.ok) {
                return fail(deleted.reason);
            }
            return ok({ ok: true, name: deleted.name });
        },
        async deleteSpreadsheets(names) {
            const deleted = await deleteSpreadsheetFiles(spreadsheetsDir, names);
            if (!deleted.ok) {
                return fail(deleted.reason);
            }
            return ok({ ok: true, deleted: deleted.deleted });
        },
        reportAvailable() {
            return reportAvailable(reportDir);
        },
    };

    return service;
}
