/**
 * At Scale Conference Accessibility Test Suite
 * 
 * This test suite performs automated accessibility testing for atscaleconference.com
 * using Playwright and axe-core. It generates Excel reports for any accessibility
 * violations found during testing.
 * 
 * Configuration is managed through the at-scale-fixture.ts file to ensure
 * consistent scanning rules across all tests.
 */

import { test, expect } from './fixtures/at-scale-fixture';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

/**
 * URL Slugs Configuration
 * 
 * Array of page slugs to test for accessibility violations.
 * Each slug is appended to the baseURL to create the full test URL.
 */
const slugs = [
    "news-ideas/",
    "speaker-submissions",
    "events/scale-networking",
    "events/scale-systems-reliability"
]

/** Base URL for all tests - the domain being tested */
const baseURL = 'https://atscaleconference.com';

/**
 * DataRow Interface
 * 
 * Defines the structure for each accessibility violation record.
 * Each row represents a single violation instance found on a page.
 * 
 * @property page - The slug/path of the page being tested
 * @property device - User agent string identifying the browser/device
 * @property id - Unique identifier for the type of accessibility violation
 * @property impact - Severity level (e.g., 'critical', 'serious', 'moderate', 'minor')
 * @property tags - Comma-separated list of relevant WCAG tags
 * @property description - Detailed explanation of the violation
 * @property help - Short description of how to fix the issue
 * @property helpUrl - Link to detailed documentation about the violation
 * @property html - HTML snippet of the problematic element
 * @property target - CSS selector(s) to locate the element
 * @property failureSummary - Summary of why the element failed the accessibility check
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

/**
 * Global sheet data array
 * 
 * WARNING: This is shared across all test executions.
 * Consider moving to local scope if running tests in parallel.
 */
let sheetData: DataRow[] = []

/**
 * Excel Spreadsheet Writer
 * 
 * Creates an Excel file containing all accessibility violations for a specific
 * page/browser combination. Each violation is written as a row with all relevant
 * details for remediation.
 * 
 * @param slug - The page slug used to generate the filename
 * @param data - Array of DataRow objects containing violation details
 * 
 * Output: Creates/overwrites an Excel file in the 'spreadsheets' directory
 * Filename format: {slug}.xlsx (sanitized for filesystem safety)
 */
function sheetWriter(slug: string, data: any[]) {
    // Sanitize slug for safe filename (replace non-alphanumeric with underscore)
    const safeSlug = slug.replace(/[^a-z0-9]/gi, '_');

    // Convert JSON data to Excel worksheet format
    const ws = XLSX.utils.json_to_sheet(data);

    // Create new workbook and add the worksheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "full_data");

    try {
        // Ensure output directory exists
        const dir = 'spreadsheets';

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }

        // Write Excel file to disk
        XLSX.writeFile(wb, path.join(dir, `${safeSlug}.xlsx`));
        console.log(`Successfully wrote spreadsheet for ${slug}`);
    } catch (error) {
        console.error(`Error writing spreadsheet for ${slug}:`, error);
    }
}

/**
 * Main Test Loop
 * 
 * Iterates through each slug to create individual test cases.
 * Each test will run across all configured browsers/devices.
 */
for (let slug of slugs) {

    let url = baseURL + "/" + slug

    try {
        test(`visit ${url}`, async ({ page, axeScanner }, testInfo) => {

            // Construct the full URL and navigate to the page
            let url = baseURL + "/" + slug
            await page.goto(url);

            /**
             * Run Accessibility Scan
             * 
             * Uses the At Scale-specific fixture with pre-configured:
             * - reCAPTCHA exclusions
             * - Disabled rules for known false positives
             */
            const accessibilityScanResults = await axeScanner.analyze();

            // Capture the browser/device user agent for reporting
            const deviceInfo = {
                userAgent: await page.evaluate(() => navigator.userAgent),
            };

            /**
             * Process Accessibility Violations
             * 
             * The violations structure is nested:
             * - Each violation type (element[1]) contains multiple nodes (instances)
             * - We flatten this into individual rows for easier analysis in Excel
             * 
             * NOTE: sheetWriter is being called inside the forEach loop, which means
             * it will create a spreadsheet for EVERY violation type found. This may
             * result in multiple files being written and overwriting each other.
             * Consider moving sheetWriter outside the loop.
             */
            Object.entries(accessibilityScanResults.violations)
                .forEach((element) => {
                    element[1].nodes.forEach((node) => {
                        let dataRow: DataRow = {
                            page: slug,
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

                    /**
                     * Special Slug Handling
                     * 
                     * These conditions handle legacy paths that need filename sanitization.
                     * Note: These paths don't appear in the slugs array for At Scale,
                     * so these conditions may be dead code from copying another test file.
                     */
                    if (slug === "loc/warwick-pizza/") {
                        slug = "warwick-pizza"
                        sheetWriter(slug, sheetData)
                    }

                    if (slug === "loc/catering-inquiry") {
                        slug = "catering-inquiry"
                        sheetWriter(slug, sheetData)
                    }

                    if (slug) {
                        sheetWriter(slug, sheetData)
                    }
                })

            /**
             * Test Assertion
             * 
             * Expects no accessibility violations. If violations exist, the test fails
             * and the spreadsheet report provides detailed information for remediation.
             * 
             * Note: This assertion will cause the test to fail, but the spreadsheet
             * will still be generated to help with debugging.
             */
            expect(accessibilityScanResults.violations).toEqual([])

        });

    } catch (error) {
        console.log(console.error())
    }

}
