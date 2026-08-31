import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { defaultScanProjects, getSite, scanProjectNames } from './config/sites.js';
import { allureReportId } from './dashboard/allure-reports.js';

const noSandbox = process.env.PLAYWRIGHT_NO_SANDBOX === '1';

const projectByName = {
    chromium: { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    'Mobile Chrome': { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    webkit: { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    'Mobile Safari': { name: 'Mobile Safari', use: { ...devices['iPhone 14'] } },
    iPad: { name: 'iPad', use: { ...devices['iPad Pro 11'] } },
} as const;

function projectsForScan() {
    const fromEnv = (process.env.SCAN_PROJECTS ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    const siteId = process.env.SITE_ID;
    let names = defaultScanProjects;
    if (fromEnv.length) {
        names = fromEnv;
    } else if (siteId) {
        const configured = getSite(siteId).projects;
        if (configured?.length) {
            names = configured;
        }
    }
    return names.map((name) => {
        if (!scanProjectNames.includes(name) || !projectByName[name]) {
            throw new Error(`Unknown scan project: ${name}`);
        }
        return projectByName[name];
    });
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results.json' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['allure-playwright', {
      resultsDir: process.env.ALLURE_RESULTS_DIR || path.join('allure-results', allureReportId(process.env.SITE_ID || 'scan')),
    }]
  ],
  use: {
    trace: 'on-first-retry',
    launchOptions: {
      args: noSandbox ? ['--no-sandbox'] : [],
    },
  },
  projects: projectsForScan(),
});
