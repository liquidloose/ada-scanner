/**
 * TFG Accessibility Test Suite
 * 
 * This test suite performs automated accessibility testing across multiple pages
 * and devices using Playwright and axe-core. It generates Excel reports for any
 * accessibility violations found during testing.
 */

import { test, expect } from './fixtures/tfg-fixture';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

/**
 * URL Slugs Configuration
 * 
 * Array of page slugs to test for accessibility violations.
 * Each slug is appended to the baseURL to create the full test URL.
 * Empty string ("") tests the homepage.
 */
const slugs = [
    "",
    "links/",
    "case-studies/national-park-service/",
    "case-studies/",
    "case-studies/allianz-trade/",
    "full-service-agency-services-business-growth/",
    "studio/",
    "careers/",
    "case-studies/the-west-coast-studio-buildout/",
    "case-studies/buttonwood-park-zoo/",
    "studio/ron-lussier/",
    "useful-event-production-services/",
    "studio/sean-anderson/",
    "video/",
    "contact/",
    "case-studies/new-bedford-ocean-cluster/",
    "case-studies/1111-the-practice/",
    "case-studies/zeal-technology/",
    "case-studies/baycoast-bank/",
    "cannabis/",
    "tfg-agency-podcast/",
    "case-studies/poyant-signs/",
    "case-studies/care-free-homes-inc/",
    "case-studies/hitachi-vantara-2/",
    "reviews/",
    "case-studies/buy-black-nb/",
    "studio/serena-cabido/",
    "studio/justin-hebert/",
    "studio/sarah-harding/",
    "studio/tracy-deescobar/",
    "workwithus/",
    "case-studies/cnbc/",
    "case-studies/long-built-homes/",
    "case-studies/donna-harris-richards/",
    "case-studies/hitachi-vantara/",
    "studio/victoria-thomas/",
    "studio/teresina-francis/",
    "studio/nicholas-francis/",
    "studio/courtney-raymond/",
    "marketing/",
    "virtual-events/",
    "insights/",
    "case-studies/yamaha-music-usa/",
    "case-studies/clearplan/",
    "case-studies/international-data-group/",
    "case-studies/access-biologicals/"
]

/** Base URL for all tests - the domain being tested */
const baseURL = 'https://thefranchisegroup.com';

/**
 * Test Metrics Configuration
 * 
 * Calculate total number of tests that will execute.
 * This is used for reporting and progress tracking.
 */
const activeBrowsers = ['Mobile Chrome', 'Google Chrome'];
const totalTests = slugs.length * activeBrowsers.length;

/**
 * Startup Information Display
 * 
 * Prints test suite information once at the beginning of the test run.
 * Uses a flag to prevent duplicate printing when tests run in parallel
 * across multiple workers or during retries.
 */
let startupPrinted = false;
function printStartupInfo() {
    if (!startupPrinted) {
        console.log(`🚀 Starting TFG Accessibility Test Suite`);
        console.log(`📋 Testing ${slugs.length} pages across ${activeBrowsers.length} browsers/devices`);
        console.log(`🎯 Total tests to run: ${totalTests}`);
        console.log(`🌐 Base URL: ${baseURL}`);
        console.log('─'.repeat(80));
        startupPrinted = true;
    }
}

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
 * Filename format: {slug}_{browser}.xlsx
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
        console.log(`📄 Successfully wrote spreadsheet: ${safeSlug}.xlsx (${data.length} violations)`);
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
            // Display startup info on first test execution
            printStartupInfo();

            // Construct the full URL and navigate to the page
            let url = baseURL + "/" + slug
            await page.goto(url);

            /**
             * Run Accessibility Scan
             * 
             * Uses the TFG-specific fixture with pre-configured:
             * - reCAPTCHA exclusions
             * - Disabled rules for known false positives
             */
            const accessibilityScanResults = await axeScanner.analyze();

            // Initialize array to store violations for this specific test
            // Using local scope prevents data mixing between parallel test runs
            let sheetData: DataRow[] = []

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
             * If violations exist, generate a spreadsheet report.
             * Browser name is sanitized (spaces replaced with underscores) for filename.
             */
            const browserName = testInfo.project.name || 'unknown';
            if (sheetData.length > 0) {
                console.log(`📊 Running accessibility scan on ${url} using ${browserName}`);

                /**
                 * Special Slug Handling
                 * 
                 * Some slugs need to be shortened or modified for cleaner filenames.
                 * This handles legacy paths or special cases that would create
                 * problematic filenames.
                 * Use "home" as filename for home page (empty slug).
                 */
                let filenameSlug = slug || "home";
                if (filenameSlug === "loc/warwick-pizza/") {
                    filenameSlug = "warwick-pizza"
                } else if (filenameSlug === "loc/catering-inquiry") {
                    filenameSlug = "catering-inquiry"
                }
                sheetWriter(`${filenameSlug}_${browserName.replace(/\s+/g, '_')}`, sheetData)
            } else {
                console.log(`✅ No accessibility violations found on ${url} using ${browserName}`);
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
