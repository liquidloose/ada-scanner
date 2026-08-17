/**
 * River's Edge Accessibility Test Suite
 *
 * Automated accessibility testing for the River's Edge landing page
 * (rivedge-site.ferret-boa.ts.net) using Playwright and axe-core.
 * Generates Excel reports for any accessibility violations found.
 *
 * Configuration is managed through rivedge-fixture.ts.
 */

import { test, expect } from './fixtures/rivedge-fixture';
import * as XLSX from 'xlsx';

/**
 * URL Slugs Configuration
 *
 * Landing page only — empty string ("") tests the homepage.
 */
const slugs = [
    "",
]

/** Base URL for all tests */
const baseURL = 'https://rivedge-site.ferret-boa.ts.net';

/**
 * DataRow Interface
 *
 * Structure for each accessibility violation record written to Excel.
 */
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

let sheetData: DataRow[] = []

function sheetWriter(slug: string) {
    const ws = XLSX.utils.json_to_sheet(sheetData)
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "full_data")
    XLSX.writeFile(wb, `spreadsheets/${slug}.xlsx`)
}

for (let slug of slugs) {

    let url = baseURL + "/" + slug

    try {
        test(`visit ${url}`, async ({ page, axeScanner }, testInfo) => {

            let url = baseURL + "/" + slug
            const separator = url.includes('?') ? '&' : '?';
            await page.goto(`${url}${separator}_cacheBust=${Date.now()}`, { waitUntil: 'networkidle' });

            const accessibilityScanResults = await axeScanner.analyze();

            const deviceInfo = {
                userAgent: await page.evaluate(() => navigator.userAgent),
            };

            Object.entries(accessibilityScanResults.violations)
                .forEach((element) => {
                    element[1].nodes.forEach((node) => {
                        let dataRow: DataRow = {
                            page: slug || "home",
                            device: deviceInfo.userAgent,
                            id: element[1].id,
                            impact: element[1].impact,
                            tags: element[1].tags.join(", "),
                            description: element[1].description,
                            help: element[1].help,
                            helpUrl: element[1].helpUrl,
                            html: node.html,
                            target: node.target.join(", "),
                            failureSummary: node.failureSummary
                        }

                        sheetData.push(dataRow)
                    })
                })

            if (sheetData.length > 0) {
                sheetWriter(slug || "home")
            }

            expect(accessibilityScanResults.violations).toEqual([])

        });

    } catch (error) {
        console.log(console.error())
    }

}
