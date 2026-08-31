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
    collectScanFiles,
} from './artifacts.js';
import {
    allureResultsAvailable,
    clearAllureData,
    deleteAllureReport as removeAllureReport,
    generateAllureReport as writeAllureReport,
    listAllureReports as listAllureReportFiles,
    resolveAllureFile as resolveAllureReportFile,
} from './allure-reports.js';
import { errorBody, errorStatus } from './errors.js';
import { createRunner } from './runner.js';
import { createSavedScanStore } from './saved-scans.js';
import { siteAddress, siteUrl, defaultSitesPath, defaultAxe, loadSites, writeSites, publicSite, slugKey, scanProjects } from '../config/sites.js';
import { loadSuites } from './suites.js';
import {
    failedRecon,
    labelFromUrl,
    normalizeSiteUrl,
    runSiteRecon as defaultRunSiteRecon,
    siteIdFromUrl,
    urlToSlug,
} from './site-recon.js';
import { combineSpreadsheets as writeCombinedSpreadsheets } from '../utils/combine-sheets.js';

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.dirname(dashboardDir);
export const defaultReportDir = path.join(uiDir, 'playwright-report');
export const defaultSpreadsheetsDir = path.join(uiDir, 'spreadsheets');
export const defaultSavedScansDb = path.join(uiDir, 'data', 'scans.sqlite');
export const defaultAllureResultsDir = path.join(uiDir, 'allure-results');
export const defaultAllureReportsDir = path.join(uiDir, 'allure-reports');

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
    runner: providedRunner,
    reportDir = defaultReportDir,
    spreadsheetsDir = defaultSpreadsheetsDir,
    savedScansDb = ':memory:',
    allureResultsDir = defaultAllureResultsDir,
    allureReportsDir = defaultAllureReportsDir,
    generateAllure = writeAllureReport,
    sitesPath = process.env.ADA_SITES_FILE || defaultSitesPath,
    runSiteRecon = defaultRunSiteRecon,
} = {}) {
    const loadCatalog = () => loadSuites(sitesPath);
    const runner =
        providedRunner ??
        createRunner({
            suites: loadCatalog(),
            loadCatalog,
        });
    const savedScans = createSavedScanStore(savedScansDb);

    function refreshCatalog() {
        runner.reloadCatalog?.();
    }

    function originOf(url) {
        try {
            return new URL(url).origin;
        } catch {
            return null;
        }
    }

    async function applyRecon(site) {
        const result = await runSiteRecon(site.baseURL);
        const recon = result.ok ? result.recon : failedRecon(result.error);
        const slugs = recon.status === 'ok' && recon.slugs?.length ? recon.slugs : site.slugs?.length ? site.slugs : [''];
        const next = loadSites(sitesPath).map((entry) =>
            entry.id === site.id ? { ...entry, slugs, recon } : entry
        );
        writeSites(next, sitesPath);
        refreshCatalog();
        return next.find((entry) => entry.id === site.id) ?? { ...site, slugs, recon };
    }
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
                scanProjects,
            });
        },
        listSites() {
            return ok({
                sites: loadSites(sitesPath).map(publicSite),
                busy: runner.isBusy(),
            });
        },
        async addSite({ url, label } = {}) {
            const baseURL = normalizeSiteUrl(url);
            if (!baseURL) {
                return fail('invalid-site');
            }
            const sites = loadSites(sitesPath);
            if (sites.some((site) => originOf(site.baseURL) === baseURL)) {
                return fail('site-exists');
            }
            const id = siteIdFromUrl(
                baseURL,
                sites.map((site) => site.id)
            );
            const site = {
                id,
                label: String(label || '').trim() || labelFromUrl(baseURL),
                baseURL,
                slugs: [''],
                cacheBust: true,
                waitUntil: 'load',
                axe: {
                    tags: [...defaultAxe.tags],
                    exclude: [],
                    disableRules: [],
                },
            };
            writeSites([...sites, site], sitesPath);
            refreshCatalog();
            const reconned = await applyRecon(site);
            return ok({ ok: true, site: publicSite(reconned) }, 201);
        },
        async reconSite(id) {
            if (!id) {
                return fail('no-selection');
            }
            const sites = loadSites(sitesPath);
            const site = sites.find((entry) => entry.id === id);
            if (!site) {
                return fail('unknown');
            }
            const reconned = await applyRecon(site);
            return ok({ ok: true, site: publicSite(reconned) });
        },
        deleteSiteSlugs(id, slugs) {
            if (!id) {
                return fail('no-selection');
            }
            if (!Array.isArray(slugs) || slugs.length === 0) {
                return fail('no-selection');
            }
            const sites = loadSites(sitesPath);
            const site = sites.find((entry) => entry.id === id);
            if (!site) {
                return fail('unknown');
            }
            const remove = new Set(slugs.map((entry) => slugKey(entry)));
            const kept = site.slugs.filter((entry) => !remove.has(slugKey(entry)));
            if (kept.length === site.slugs.length) {
                return fail('missing');
            }
            if (kept.length === 0) {
                return fail('keep-one-slug');
            }
            let recon = site.recon;
            if (recon) {
                const reconSlugs = (recon.slugs ?? []).filter((entry) => !remove.has(slugKey(entry)));
                const urls = (recon.urls ?? []).filter((item) => {
                    const slug = urlToSlug(site.baseURL, item);
                    return slug == null || !remove.has(slugKey(slug));
                });
                recon = {
                    ...recon,
                    slugs: reconSlugs,
                    urls,
                    counts: {
                        ...(recon.counts ?? {}),
                        urls: urls.length || reconSlugs.length,
                    },
                };
            }
            const next = sites.map((entry) =>
                entry.id === site.id ? { ...entry, slugs: kept, recon } : entry
            );
            writeSites(next, sitesPath);
            refreshCatalog();
            return ok({
                ok: true,
                site: publicSite(next.find((entry) => entry.id === site.id)),
                deleted: [...remove],
            });
        },
        startRun(id, options = {}) {
            const result = runner.start(id, options);
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
        async stopRun() {
            const result = runner.stop();
            const current = await service.getCurrentRun();
            return ok({
                ok: true,
                stopped: result.stopped,
                ...current.data,
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
        async listAllureReports() {
            return ok({
                results: await allureResultsAvailable(allureResultsDir),
                reports: await listAllureReportFiles(allureReportsDir),
            });
        },
        async createAllureReport() {
            if (runner.isBusy()) {
                return fail('busy', { busy: true });
            }
            const suite = service.currentSuite();
            const generated = await generateAllure({
                resultsDir: allureResultsDir,
                reportsDir: allureReportsDir,
                suiteId: runner.getCurrent().id ?? suite?.id ?? null,
                siteUrl: siteUrl(suite?.baseURL) ?? null,
            });
            if (!generated.ok) {
                return fail(generated.reason);
            }
            return ok({ ok: true, report: generated.report }, 201);
        },
        async deleteAllureReport(id) {
            if (runner.isBusy()) {
                return fail('busy', { busy: true });
            }
            const deleted = await removeAllureReport(allureReportsDir, id);
            if (!deleted.ok) {
                return fail(deleted.reason);
            }
            return ok({ ok: true, id: deleted.id });
        },
        async clearAllure() {
            if (runner.isBusy()) {
                return fail('busy', { busy: true });
            }
            await clearAllureData(allureResultsDir, allureReportsDir);
            return ok({ ok: true, results: false, reports: [] });
        },
        async resolveAllureFile(id, relative) {
            const resolved = await resolveAllureReportFile(allureReportsDir, id, relative);
            if (!resolved.ok) {
                return fail(resolved.reason);
            }
            return ok(resolved);
        },
        async listSpreadsheets() {
            return ok({ files: await listSpreadsheetFiles(spreadsheetsDir) });
        },
        currentSuite() {
            const current = runner.getCurrent();
            return runner.listSuites().find((suite) => suite.id === current.id) ?? null;
        },
        combineSpreadsheets() {
            if (runner.isBusy()) {
                return fail('busy', { busy: true });
            }
            const combined = writeCombinedSpreadsheets(spreadsheetsDir, {
                siteAddress: siteAddress(service.currentSuite()?.baseURL),
            });
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
        async saveCurrentScan() {
            if (runner.isBusy()) {
                return fail('busy', { busy: true });
            }
            const hasReport = await reportAvailable(reportDir);
            const sheets = await listSpreadsheetFiles(spreadsheetsDir);
            if (!hasReport && sheets.length === 0) {
                return fail('no-scan-data');
            }
            const current = runner.getCurrent();
            const files = await collectScanFiles({
                reportDir,
                spreadsheetsDir,
                allureReportsDir,
                logs: current.logs,
            });
            if (files.length === 0) {
                return fail('no-scan-data');
            }
            const suite = service.currentSuite();
            const scan = savedScans.save({
                suiteId: current.id ?? suite?.id ?? null,
                siteUrl: siteUrl(suite?.baseURL) ?? null,
                files,
            });
            return ok({ ok: true, scan });
        },
        listSavedScans() {
            return ok({ scans: savedScans.list() });
        },
        getSavedScan(id) {
            const scan = savedScans.get(id);
            if (!scan) {
                return fail('missing');
            }
            return ok(scan);
        },
        deleteSavedScan(id) {
            if (!savedScans.delete(id)) {
                return fail('missing');
            }
            return ok({ ok: true, id: Number(id) });
        },
        deleteSavedScans(ids) {
            if (!Array.isArray(ids) || ids.length === 0) {
                return fail('no-selection');
            }
            const deleted = savedScans.deleteMany(ids);
            if (deleted.length === 0) {
                return fail('missing');
            }
            return ok({ ok: true, deleted });
        },
        close() {
            savedScans.close();
        },
    };

    return service;
}
