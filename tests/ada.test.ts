/**
 * ADA Local Development Accessibility Test Suite
 * 
 * This test suite performs automated accessibility testing on a local development
 * server using Playwright and axe-core. It generates Excel reports for any
 * accessibility violations found during testing.
 * 
 * Configuration is managed through the ada-fixture.ts file to ensure
 * consistent scanning rules across all tests. This fixture includes the most
 * permissive rule set (11 disabled rules) for development environments.
 * 
 * Target: Local development server at http://192.168.1.17:8001
 */

import { test, expect } from './fixtures/ada-fixture';
import * as XLSX from 'xlsx';

/**
 * URL Slugs Configuration
 * 
 * Array of page slugs to test for accessibility violations.
 * Each slug is appended to the baseURL to create the full test URL.
 * Empty string ("") tests the homepage.
 * 
 * Note: This is a reduced set for development testing compared to production.
 */
const slugs = [
    "",
    "case-studies",
    "contact",
    "full-service-agency-services-business-growth",
    "studio",
    "insights",
    "tfg-agency-podcast",
    "careers"
]

/** Base URL for all tests - local development server */
const baseURL = 'http://192.168.1.17:8001';

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
 * Creates an Excel file containing all accessibility violations.
 * Writes the global sheetData array to a spreadsheet file.
 * 
 * @param slug - The page slug used to generate the filename
 * 
 * Output: Creates/overwrites an Excel file in the 'spreadsheets' directory
 * Filename format: {slug}.xlsx
 * 
 * WARNING: This function does not sanitize the slug for filesystem safety.
 * Slugs with special characters may cause file write errors.
 */
function sheetWriter(slug) {
    const ws = XLSX.utils.json_to_sheet(sheetData)
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "full_data")
    XLSX.writeFile(wb, `spreadsheets/${slug}.xlsx`)
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
             * Uses the ADA-specific fixture with pre-configured:
             * - reCAPTCHA exclusions
             * - Extended disabled rules (11 rules) for development environment
             * 
             * The ADA fixture is the most permissive, designed for local development
             * where some accessibility features may still be in progress.
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
                })

            /**
             * Excel Report Generation
             * 
             * Write spreadsheet if violations were found.
             * Use "home" as filename for home page (empty slug).
             */
            if (sheetData.length > 0) {
                const filename = slug || "home";
                sheetWriter(filename)
            }

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

