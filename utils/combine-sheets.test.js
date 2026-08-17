import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { combineSpreadsheets } from './combine-sheets.js';

function writeSheet(dir, name, rows) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows));
    XLSX.writeFile(workbook, path.join(dir, name));
}

function readRows(filePath) {
    const workbook = XLSX.read(readFileSync(filePath));
    return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
}

test('combineSpreadsheets writes master-list and a deduped work-list', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ada-combine-'));
    writeSheet(dir, 'home.xlsx', [
        { page: 'home', target: '#nav', failureSummary: 'contrast' },
        { page: 'home', target: '#cta', failureSummary: 'name' },
    ]);
    writeSheet(dir, 'about.xlsx', [
        { page: 'about', target: '#nav', failureSummary: 'contrast' },
        { page: 'about', target: '#footer', failureSummary: 'label' },
    ]);
    writeSheet(dir, 'master-list.xlsx', [{ page: 'stale', target: '#old', failureSummary: 'ignore' }]);

    const result = combineSpreadsheets(dir);
    assert.equal(result.ok, true);
    assert.deepEqual(result.sources, ['about.xlsx', 'home.xlsx']);
    assert.equal(result.master.rows, 4);
    assert.equal(result.work.rows, 3);

    const master = readRows(path.join(dir, 'master-list.xlsx'));
    const work = readRows(path.join(dir, 'work-list.xlsx'));
    assert.equal(master.length, 4);
    assert.equal(work.length, 3);
    assert.equal(
        work.filter((row) => row.target === '#nav' && row.failureSummary === 'contrast').length,
        1
    );
});

test('combineSpreadsheets prefixes combined files with the site address', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ada-combine-site-'));
    writeSheet(dir, 'piezonis.com_home.xlsx', [
        { page: 'home', target: '#nav', failureSummary: 'contrast' },
    ]);
    writeSheet(dir, 'piezonis.com_menu.xlsx', [
        { page: 'menu', target: '#nav', failureSummary: 'contrast' },
        { page: 'menu', target: '#cta', failureSummary: 'name' },
    ]);
    writeSheet(dir, 'piezonis.com_master-list.xlsx', [{ page: 'stale', target: '#old', failureSummary: 'ignore' }]);

    const result = combineSpreadsheets(dir);
    assert.equal(result.ok, true);
    assert.deepEqual(result.sources, ['piezonis.com_home.xlsx', 'piezonis.com_menu.xlsx']);
    assert.equal(result.master.name, 'piezonis.com_master-list.xlsx');
    assert.equal(result.work.name, 'piezonis.com_work-list.xlsx');
    assert.equal(result.master.rows, 3);
    assert.equal(result.work.rows, 2);
});

test('combineSpreadsheets needs per-page spreadsheets', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ada-combine-empty-'));
    writeSheet(dir, 'work-list.xlsx', [{ page: 'only', target: '#a', failureSummary: 'x' }]);
    const result = combineSpreadsheets(dir);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no-spreadsheets');
});
