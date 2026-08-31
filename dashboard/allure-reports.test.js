import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import os from 'os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
    allureReportId,
    allureReportName,
    allureResultsAvailable,
    clearAllureData,
    deleteAllureReport,
    generateAllureReport,
    listAllureReports,
    resolveAllureFile,
    resolveAllureResultsDir,
} from './allure-reports.js';

function fakeSpawn() {
    const calls = [];
    const spawn = (command, args) => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = () => {};
        calls.push({ command, args, child });
        queueMicrotask(async () => {
            const outputFlag = args.indexOf('-o');
            const outputDir = outputFlag >= 0 ? args[outputFlag + 1] : null;
            if (outputDir && child.exitCode !== 'fail') {
                await mkdir(outputDir, { recursive: true });
                await writeFile(path.join(outputDir, 'index.html'), '<html>allure</html>');
            }
            child.emit('exit', child.exitCode === 'fail' ? 1 : 0);
        });
        return child;
    };
    return { spawn, calls };
}

test('allureReportName rejects path segments', () => {
    assert.equal(allureReportName('piezonis-2026-08-18T15-00-00-000Z'), 'piezonis-2026-08-18T15-00-00-000Z');
    assert.equal(allureReportName('../secret'), null);
    assert.equal(allureReportName('a/b'), null);
});

test('allureReportId prefixes the suite id', () => {
    const id = allureReportId('piezonis', new Date('2026-08-18T15:39:12.123Z'));
    assert.equal(id, 'piezonis-2026-08-18T15-39-12-123Z');
});

test('generateAllureReport writes a timestamped report from results', async () => {
    const resultsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-allure-results-'));
    const reportsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-allure-reports-'));
    await writeFile(path.join(resultsDir, 'abc-result.json'), '{}');
    const { spawn, calls } = fakeSpawn();

    const generated = await generateAllureReport({
        resultsDir,
        reportsDir,
        suiteId: 'piezonis',
        siteUrl: 'https://piezonis.com',
        spawn,
        now: new Date('2026-08-18T15:39:12.123Z'),
    });

    assert.equal(generated.ok, true);
    assert.equal(generated.report.id, 'piezonis-2026-08-18T15-39-12-123Z');
    assert.equal(generated.report.href, '/allure/piezonis-2026-08-18T15-39-12-123Z/');
    assert.equal(generated.report.suiteId, 'piezonis');
    assert.equal(calls[0].args[0], 'generate');
    assert.equal(calls[0].args[1], resultsDir);

    const listed = await listAllureReports(reportsDir);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, generated.report.id);

    const file = await resolveAllureFile(reportsDir, generated.report.id, 'index.html');
    assert.equal(file.ok, true);
    assert.match(file.filePath, /index\.html$/);

    const deleted = await deleteAllureReport(reportsDir, generated.report.id);
    assert.equal(deleted.ok, true);
    assert.deepEqual(await listAllureReports(reportsDir), []);
});

test('resolveAllureResultsDir prefers the newest timestamped run folder', async () => {
    const resultsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-allure-nested-'));
    const older = path.join(resultsDir, 'rivedge-2026-08-18T15-00-00-000Z');
    const newer = path.join(resultsDir, 'piezonis-2026-08-18T16-00-00-000Z');
    await mkdir(older, { recursive: true });
    await mkdir(newer, { recursive: true });
    await writeFile(path.join(older, 'old-result.json'), '{}');
    await writeFile(path.join(newer, 'new-result.json'), '{}');
    await writeFile(path.join(resultsDir, 'leftover-result.json'), '{}');

    assert.equal(await allureResultsAvailable(resultsDir), true);
    assert.equal(await resolveAllureResultsDir(resultsDir), newer);

    const reportsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-allure-nested-out-'));
    const { spawn, calls } = fakeSpawn();
    const generated = await generateAllureReport({
        resultsDir,
        reportsDir,
        suiteId: 'piezonis',
        spawn,
        now: new Date('2026-08-18T16:05:00.000Z'),
    });
    assert.equal(generated.ok, true);
    assert.equal(calls[0].args[1], newer);
});

test('generateAllureReport refuses when there are no Allure results', async () => {
    const resultsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-allure-empty-'));
    const reportsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-allure-empty-out-'));
    assert.equal(await allureResultsAvailable(resultsDir), false);
    const generated = await generateAllureReport({
        resultsDir,
        reportsDir,
        spawn: fakeSpawn().spawn,
    });
    assert.equal(generated.ok, false);
    assert.equal(generated.reason, 'no-allure-results');
    assert.deepEqual(await listAllureReports(reportsDir), []);
});

test('clearAllureData wipes results and generated reports', async () => {
    const resultsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-allure-clear-results-'));
    const reportsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-allure-clear-reports-'));
    await writeFile(path.join(resultsDir, 'abc-result.json'), '{}');
    await writeFile(path.join(resultsDir, 'container.json'), '{}');
    const id = 'piezonis-2026-08-18T15-39-12-123Z';
    await mkdir(path.join(reportsDir, id), { recursive: true });
    await writeFile(path.join(reportsDir, id, 'index.html'), '<html>allure</html>');

    const cleared = await clearAllureData(resultsDir, reportsDir);
    assert.equal(cleared.ok, true);
    assert.equal(await allureResultsAvailable(resultsDir), false);
    assert.deepEqual(await readdir(resultsDir), []);
    assert.deepEqual(await listAllureReports(reportsDir), []);
    assert.deepEqual(await readdir(reportsDir), []);
});

test('resolveAllureFile blocks path traversal', async () => {
    const reportsDir = await mkdtemp(path.join(os.tmpdir(), 'ada-allure-trav-'));
    const id = 'piezonis-2026-08-18T15-39-12-123Z';
    await mkdir(path.join(reportsDir, id), { recursive: true });
    await writeFile(path.join(reportsDir, id, 'index.html'), '<html>ok</html>');
    const escaped = await resolveAllureFile(reportsDir, id, '../package.json');
    assert.equal(escaped.ok, false);
    assert.equal(escaped.reason, 'invalid');
});
