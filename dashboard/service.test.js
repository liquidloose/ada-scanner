import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createRunner } from './runner.js';
import { createScannerService } from './service.js';
import { loadSuites } from './suites.js';
import * as XLSX from 'xlsx';

function fakeSpawn() {
    const calls = [];
    const spawn = (command, args) => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = (signal) => {
            child.signal = signal;
        };
        calls.push({ command, args, child });
        return child;
    };
    return { spawn, calls };
}

test('service starts a suite and reports it as the current run', async () => {
    const { spawn, calls } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null, hungAfterMs: 0 }),
        reportDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-report-')),
        spreadsheetsDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-sheets-')),
    });

    const started = service.startRun('rivedge');
    assert.equal(started.ok, true);
    assert.equal(started.status, 202);
    assert.equal(started.data.status, 'running');
    assert.equal(calls.length, 1);

    calls[0].child.stdout.write('Running 2 tests\n');
    calls[0].child.emit('exit', 0);
    await started.result.done;

    const current = await service.getCurrentRun();
    assert.equal(current.data.status, 'finished');
    assert.equal(current.data.code, 0);
    assert.match(current.data.logs, /Running 2 tests/);
});

test('service lists and deletes spreadsheets', async () => {
    const spreadsheetsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-service-del-'));
    await writeFile(path.join(spreadsheetsDir, 'home.xlsx'), 'home-sheet');
    await writeFile(path.join(spreadsheetsDir, 'notes.txt'), 'ignore me');
    const { spawn } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null, hungAfterMs: 0 }),
        reportDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-report-')),
        spreadsheetsDir,
    });

    const listed = await service.listSpreadsheets();
    assert.deepEqual(
        listed.data.files.map((file) => file.name),
        ['home.xlsx']
    );
    assert.equal(listed.data.files[0].path, path.resolve(spreadsheetsDir, 'home.xlsx'));

    const deleted = await service.deleteSpreadsheets(['home.xlsx']);
    assert.deepEqual(deleted.data.deleted, ['home.xlsx']);
    const empty = await service.listSpreadsheets();
    assert.deepEqual(empty.data.files, []);
});

test('waitForRun returns once the child exits', async () => {
    const { spawn, calls } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null, hungAfterMs: 0 }),
        reportDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-wait-')),
        spreadsheetsDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-wait-sheets-')),
    });
    service.startRun('piezonis');
    setImmediate(() => calls[0].child.emit('exit', 1));
    const finished = await service.waitForRun({ timeoutMs: 1000, intervalMs: 10 });
    assert.equal(finished.data.status, 'finished');
    assert.equal(finished.data.code, 1);
});

test('service stopRun kills the current scan', async () => {
    const { spawn, calls } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null, hungAfterMs: 0 }),
        reportDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-stop-')),
        spreadsheetsDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-stop-sheets-')),
    });
    service.startRun('rivedge');
    const stopped = await service.stopRun();
    assert.equal(stopped.ok, true);
    assert.equal(stopped.data.stopped, true);
    assert.equal(stopped.data.busy, false);
    assert.equal(stopped.data.status, 'finished');
    assert.equal(calls[0].child.signal, 'SIGTERM');
    const started = service.startRun('piezonis');
    assert.equal(started.ok, true);
});

test('service combines per-page spreadsheets into master-list and work-list', async () => {
    const spreadsheetsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-service-combine-'));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet([
            { page: 'home', target: '#nav', failureSummary: 'contrast' },
            { page: 'home', target: '#cta', failureSummary: 'name' },
        ])
    );
    XLSX.writeFile(workbook, path.join(spreadsheetsDir, 'home.xlsx'));
    const about = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        about,
        XLSX.utils.json_to_sheet([{ page: 'about', target: '#nav', failureSummary: 'contrast' }])
    );
    XLSX.writeFile(about, path.join(spreadsheetsDir, 'about.xlsx'));

    const { spawn } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null, hungAfterMs: 0 }),
        reportDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-combine-report-')),
        spreadsheetsDir,
    });
    const combined = service.combineSpreadsheets();
    assert.equal(combined.ok, true);
    assert.equal(combined.data.master.rows, 3);
    assert.equal(combined.data.work.rows, 2);
    const listed = await service.listSpreadsheets();
    assert.deepEqual(
        listed.data.files.map((file) => file.name),
        ['about.xlsx', 'home.xlsx', 'master-list.xlsx', 'work-list.xlsx']
    );
});

test('saveCurrentScan refuses logs or leftover report files when there is no HTML report or spreadsheet', async () => {
    const reportDir = await mkdtemp(path.join(os.tmpdir(), 'ada-service-empty-save-'));
    await mkdir(path.join(reportDir, 'data'), { recursive: true });
    await writeFile(path.join(reportDir, 'data', 'error.md'), 'leftover');
    const { spawn, calls } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null, hungAfterMs: 0 }),
        reportDir,
        spreadsheetsDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-empty-save-sheets-')),
    });

    const started = service.startRun('rivedge');
    calls[0].child.stdout.write('Running 2 tests\n');
    calls[0].child.emit('exit', 0);
    await started.result.done;

    const saved = await service.saveCurrentScan();
    assert.equal(saved.ok, false);
    assert.equal(saved.status, 400);
    assert.equal(saved.data.reason, 'no-scan-data');
    assert.deepEqual((await service.listSavedScans()).data.scans, []);
});

test('createAllureReport generates from results and lists the new report', async () => {
    const resultsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-service-allure-results-'));
    const reportsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-service-allure-reports-'));
    await writeFile(path.join(resultsDir, 'abc-result.json'), '{}');
    const { spawn, calls } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null, hungAfterMs: 0 }),
        allureResultsDir: resultsDir,
        allureReportsDir: reportsDir,
        generateAllure: async (options) => {
            const id = 'rivedge-2026-08-18T15-39-12-123Z';
            await mkdir(path.join(options.reportsDir, id), { recursive: true });
            await writeFile(path.join(options.reportsDir, id, 'index.html'), '<html>allure</html>');
            await writeFile(
                path.join(options.reportsDir, id, 'ada-meta.json'),
                JSON.stringify({
                    suiteId: options.suiteId,
                    siteUrl: options.siteUrl,
                    createdAt: '2026-08-18T15:39:12.123Z',
                })
            );
            return {
                ok: true,
                report: {
                    id,
                    createdAt: '2026-08-18T15:39:12.123Z',
                    suiteId: options.suiteId,
                    siteUrl: options.siteUrl,
                    href: `/allure/${id}/`,
                    size: 1,
                },
            };
        },
    });

    const started = service.startRun('rivedge');
    calls[0].child.emit('exit', 0);
    await started.result.done;

    const created = await service.createAllureReport();
    assert.equal(created.ok, true);
    assert.equal(created.status, 201);
    assert.equal(created.data.report.suiteId, 'rivedge');

    const listed = await service.listAllureReports();
    assert.equal(listed.data.results, true);
    assert.equal(listed.data.reports[0].id, 'rivedge-2026-08-18T15-39-12-123Z');

    const cleared = await service.clearAllure();
    assert.equal(cleared.ok, true);
    const empty = await service.listAllureReports();
    assert.equal(empty.data.results, false);
    assert.deepEqual(empty.data.reports, []);
});

test('addSite writes the site, runs recon, and reloads the suite catalog', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ada-add-site-'));
    const sitesPath = path.join(dir, 'sites.json');
    await writeFile(
        sitesPath,
        JSON.stringify({
            sites: [{ id: 'demo', baseURL: 'https://example.com', slugs: [''] }],
        })
    );
    const { spawn } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({
            spawn,
            tee: null,
            hungAfterMs: 0,
            suites: loadSuites(sitesPath),
            loadCatalog: () => loadSuites(sitesPath),
        }),
        sitesPath,
        runSiteRecon: async () => ({
            ok: true,
            recon: {
                ranAt: '2026-08-18T16:00:00.000Z',
                status: 'ok',
                error: null,
                sitemapFiles: ['https://piezonis.com/sitemap.xml'],
                sitemapLinks: ['https://piezonis.com/menu'],
                homepageLinks: ['https://piezonis.com/contact-us'],
                urls: ['https://piezonis.com/', 'https://piezonis.com/menu', 'https://piezonis.com/contact-us'],
                slugs: ['', 'menu', 'contact-us'],
                counts: { sitemapFiles: 1, sitemapLinks: 1, homepageLinks: 1, urls: 3 },
            },
        }),
    });

    const invalid = await service.addSite({ url: 'not-a-site' });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.data.reason, 'invalid-site');

    const added = await service.addSite({ url: 'https://piezonis.com', label: "Piezoni's" });
    assert.equal(added.ok, true);
    assert.equal(added.status, 201);
    assert.equal(added.data.site.id, 'piezonis');
    assert.deepEqual(added.data.site.recon.slugs, ['', 'menu', 'contact-us']);
    assert.equal(service.listSuites().data.suites.some((suite) => suite.id === 'piezonis'), true);

    const duplicate = await service.addSite({ url: 'https://piezonis.com/menu' });
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.data.reason, 'site-exists');

    const removed = service.deleteSiteSlugs('piezonis', ['menu']);
    assert.equal(removed.ok, true);
    assert.deepEqual(removed.data.site.slugs, ['', 'contact-us']);
    assert.equal(removed.data.site.recon.counts.urls, 2);

    const missing = service.deleteSiteSlugs('piezonis', ['nope']);
    assert.equal(missing.ok, false);
    assert.equal(missing.data.reason, 'missing');

    const last = service.deleteSiteSlugs('piezonis', ['', 'contact-us']);
    assert.equal(last.ok, false);
    assert.equal(last.data.reason, 'keep-one-slug');
});

test('saveCurrentScan stores the Allure report folder with the Playwright report', async () => {
    const reportDir = await mkdtemp(path.join(os.tmpdir(), 'ada-service-save-report-'));
    const reportsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-service-save-allure-'));
    const id = 'rivedge-2026-08-18T15-39-12-123Z';
    await writeFile(path.join(reportDir, 'index.html'), '<html>playwright</html>');
    await mkdir(path.join(reportsDir, id, 'widgets'), { recursive: true });
    await writeFile(path.join(reportsDir, id, 'index.html'), '<html>allure</html>');
    await writeFile(path.join(reportsDir, id, 'app.js'), 'allure-app');
    await writeFile(path.join(reportsDir, id, 'widgets', 'statistic.json'), '{"total":1}');
    const { spawn, calls } = fakeSpawn();
    const service = createScannerService({
        runner: createRunner({ spawn, tee: null, hungAfterMs: 0 }),
        reportDir,
        spreadsheetsDir: await mkdtemp(path.join(os.tmpdir(), 'ada-service-save-sheets-')),
        allureReportsDir: reportsDir,
    });

    const started = service.startRun('rivedge');
    calls[0].child.emit('exit', 0);
    await started.result.done;

    const saved = await service.saveCurrentScan();
    assert.equal(saved.ok, true);
    const scan = service.getSavedScan(saved.data.scan.id);
    const names = scan.data.files.map((file) => file.name).sort();
    assert.deepEqual(names, [
        `allure/${id}/app.js`,
        `allure/${id}/index.html`,
        `allure/${id}/widgets/statistic.json`,
        'report/index.html',
    ]);
    assert.equal(scan.data.files.filter((file) => file.kind === 'allure').length, 3);
});
