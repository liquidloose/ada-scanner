import { mkdirSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { getSite, pageUrl, sheetName, slugPath } from '../config/sites.js';
import { expect, test } from './fixtures/site-fixture';

interface DataRow {
    page: string;
    device: string;
    id: string;
    impact: string | null | undefined;
    tags: string;
    description: string;
    help: string;
    helpUrl: string;
    html: string;
    target: string;
    failureSummary: string | undefined;
}

export function defineSiteTests(siteId: string) {
    process.env.SITE_ID = siteId;
    const site = getSite(siteId);
    const sheetData: DataRow[] = [];
    mkdirSync('spreadsheets', { recursive: true });

    for (const slug of site.slugs) {
        const url = pageUrl(site.baseURL, slug);
        test(`visit ${url}`, async ({ page, axeScanner }) => {
            let target = url;
            if (site.cacheBust) {
                const separator = target.includes('?') ? '&' : '?';
                target = `${target}${separator}_cacheBust=${Date.now()}`;
            }
            await page.goto(target, { waitUntil: site.waitUntil ?? 'load' });

            const accessibilityScanResults = await axeScanner.analyze();
            const device = await page.evaluate(() => navigator.userAgent);

            for (const violation of accessibilityScanResults.violations) {
                for (const node of violation.nodes) {
                    sheetData.push({
                        page: slugPath(slug) || 'home',
                        device,
                        id: violation.id,
                        impact: violation.impact,
                        tags: violation.tags.join(', '),
                        description: violation.description,
                        help: violation.help,
                        helpUrl: violation.helpUrl,
                        html: node.html,
                        target: node.target.join(', '),
                        failureSummary: node.failureSummary,
                    });
                }
            }

            if (sheetData.length > 0) {
                const ws = XLSX.utils.json_to_sheet(sheetData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'full_data');
                XLSX.writeFile(wb, `spreadsheets/${sheetName(slug)}.xlsx`);
            }

            expect(accessibilityScanResults.violations).toEqual([]);
        });
    }
}
