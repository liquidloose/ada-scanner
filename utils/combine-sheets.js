import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

export const combinedOutputs = ['master-list.xlsx', 'work-list.xlsx'];

export function isCombinedSpreadsheet(name) {
    return /(^|_)(master-list|work-list)\.xlsx$/i.test(name);
}

export function combinedOutputNames(siteAddress) {
    const prefix = siteAddress ? `${siteAddress}_` : '';
    return {
        master: `${prefix}master-list.xlsx`,
        work: `${prefix}work-list.xlsx`,
    };
}

export function inferSiteAddress(names) {
    const prefixes = names.map((name) => {
        const match = /^([a-z0-9.-]+\.[a-z0-9.-]+)_.+\.xlsx$/i.exec(name);
        return match ? match[1].toLowerCase() : null;
    });
    if (prefixes.length === 0 || prefixes.some((prefix) => !prefix)) {
        return null;
    }
    const unique = new Set(prefixes);
    return unique.size === 1 ? prefixes[0] : null;
}

export function listSourceSpreadsheets(spreadsheetsDir) {
    if (!existsSync(spreadsheetsDir)) {
        return [];
    }
    return readdirSync(spreadsheetsDir)
        .filter(
            (name) =>
                path.extname(name).toLowerCase() === '.xlsx' &&
                !name.startsWith('.') &&
                !isCombinedSpreadsheet(name)
        )
        .sort((a, b) => a.localeCompare(b));
}

function uniqueViolations(rows) {
    const indicesToDelete = [];
    rows.forEach((outerElement, outerIndex) => {
        rows.forEach((innerElement, innerIndex) => {
            if (
                innerIndex > outerIndex &&
                outerElement.target === innerElement.target &&
                outerElement.failureSummary === innerElement.failureSummary
            ) {
                indicesToDelete.push(innerIndex);
            }
        });
    });

    const seen = new Set();
    const uniqueIndexes = indicesToDelete.filter((index) => {
        if (seen.has(index)) {
            return false;
        }
        seen.add(index);
        return true;
    });
    uniqueIndexes.sort((a, b) => b - a);

    const work = rows.slice();
    for (const index of uniqueIndexes) {
        work.splice(index, 1);
    }
    return work;
}

export function combineSpreadsheets(spreadsheetsDir, { siteAddress } = {}) {
    const sources = listSourceSpreadsheets(spreadsheetsDir);
    if (sources.length === 0) {
        return { ok: false, reason: 'no-spreadsheets' };
    }

    const sheetData = [];
    for (const name of sources) {
        const workbook = XLSX.read(readFileSync(path.join(spreadsheetsDir, name)));
        const sheetName = workbook.SheetNames[0];
        sheetData.push(...XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]));
    }

    const workRows = uniqueViolations(sheetData);
    const names = combinedOutputNames(inferSiteAddress(sources) || siteAddress || '');
    const masterPath = path.join(spreadsheetsDir, names.master);
    const workPath = path.join(spreadsheetsDir, names.work);

    const masterBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(masterBook, XLSX.utils.json_to_sheet(sheetData));
    XLSX.writeFile(masterBook, masterPath);

    const workBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workBook, XLSX.utils.json_to_sheet(workRows));
    XLSX.writeFile(workBook, workPath);

    return {
        ok: true,
        sources,
        master: { name: names.master, rows: sheetData.length, path: path.resolve(masterPath) },
        work: { name: names.work, rows: workRows.length, path: path.resolve(workPath) },
    };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const spreadsheetsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'spreadsheets');
    const result = combineSpreadsheets(spreadsheetsDir);
    if (!result.ok) {
        console.error('No per-page spreadsheet files to combine.');
        process.exit(1);
    }
    console.log(`Master list: ${result.master.rows} rows in ${result.master.name}`);
    console.log(`Work list: ${result.work.rows} unique violations in ${result.work.name}`);
}
