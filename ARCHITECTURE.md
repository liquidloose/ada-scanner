# ADA Scanner Architecture

## Purpose

ADA Scanner is a Playwright + axe-core test framework that runs accessibility scans across predefined page lists, exports per-page Excel reports, and generates aggregate reports for remediation workflows.

---

## High-Level Architecture

The tool is organized into five layers:

1. **Test Orchestration**
   - Playwright configuration defines projects (Desktop Chrome + Mobile Chrome), reporters, and test directory.
   - Entry point: `playwright.config.ts`

2. **Site Test Suites**
   - Each site has its own test file with:
     - `baseURL`
     - list of page slugs
     - scan execution + violation extraction
     - Excel export logic
   - Files: `tests/*.test.ts` (e.g. `tfg.test.ts`, `piezonis.test.ts`, `at-scale.test.ts`, `ada.test.ts`, `gnbotf.test.ts`)

3. **Axe Scanner Fixtures**
   - Each suite imports a fixture that constructs a preconfigured `AxeBuilder`.
   - Shared base [`tests/fixtures/playwright-base.ts`](tests/fixtures/playwright-base.ts) registers a passthrough request route so the browser HTTP cache is off during scans (fresh HTML and assets). Set `DISABLE_HTTP_CACHE=0` to allow normal caching for faster local reruns.
   - Fixtures control:
     - WCAG tags
     - excluded selectors
     - disabled rules
   - Files: `tests/fixtures/*-fixture.ts`

4. **Result Artifacts**
   - Raw/visual test outputs:
     - `playwright-report/`
     - `allure-results/`
     - `allure-report/`
   - Spreadsheet outputs:
     - individual files in `spreadsheets/*.xlsx`
     - aggregate files: `master-list.xlsx`, `work-list.xlsx`

5. **Post-Processing Utility**
   - `utils/combine-sheets.js` merges all spreadsheets and removes duplicates based on:
     - `target`
     - `failureSummary`

---

## Core Runtime Flow

### 1) Test Run Startup
- NPM scripts in `package.json` execute a specific suite:
  - `npm run test:tfg`
  - `npm run test:at-scale`
  - `npm run test:piezonis`
  - `npm run test:gnbotf`
- Playwright loads config and initializes reporters (list/json/html/allure).

### 2) Per-Slug Test Generation
- Each suite loops through hardcoded `slugs` and creates a Playwright test per URL.
- Each generated test:
  1. Navigates to URL
  2. Runs `axeScanner.analyze()`
  3. Flattens violations (`violations[] -> nodes[]`)
  4. Maps each violation node into a report row

### 3) Spreadsheet Export
- Violation rows are written to `.xlsx` files in `spreadsheets/`.
- Some suites include slug sanitization for safe filenames; others write raw slug names.

### 4) Assertion Gate
- Each test asserts:
  - `expect(accessibilityScanResults.violations).toEqual([])`
- Any violation fails the test run (while still generating report data).

### 5) Optional Aggregation
- `npm run combine-spreadsheets` executes `utils/combine-sheets.js`
- Produces:
  - `master-list.xlsx` (all records)
  - `work-list.xlsx` (deduplicated records for remediation tracking)

---

## Component Map

### Playwright Configuration
- **File:** `playwright.config.ts`
- **Responsibilities:**
  - test discovery (`./tests`)
  - project/browser matrix
  - reporter pipeline
  - CI-related worker/retry settings

### Test Suites
- **Files:** `tests/*.test.ts`
- **Responsibilities:**
  - target URL inventory (`slugs`)
  - invoke fixture scanner
  - transform axe output to tabular records
  - export spreadsheets

### Fixtures
- **Files:** `tests/fixtures/*-fixture.ts`
- **Responsibilities:**
  - encapsulate axe configuration per site
  - enforce consistent rule/exclusion settings
  - expose `axeScanner` fixture to tests

### Spreadsheet Combiner
- **File:** `utils/combine-sheets.js`
- **Responsibilities:**
  - read `.xlsx` files
  - append rows into master dataset
  - deduplicate by selector + failure summary
  - emit `master-list.xlsx` and `work-list.xlsx`

---

## Data Model (Violation Row)

Each exported row captures:

- `page`
- `device` (user agent)
- `id` (axe rule id)
- `impact`
- `tags`
- `description`
- `help`
- `helpUrl`
- `html`
- `target`
- `failureSummary`

This structure is effectively the framework’s canonical output contract.

---

## Directory Structure

```text
ada-scanner/
├── playwright.config.ts
├── package.json
├── tests/
│   ├── *.test.ts
│   └── fixtures/
│       └── *-fixture.ts
├── utils/
│   └── combine-sheets.js
├── spreadsheets/
│   ├── <page>_<browser>.xlsx
│   ├── master-list.xlsx
│   └── work-list.xlsx
├── playwright-report/
├── allure-results/
└── allure-report/
```

---

## Design Characteristics

### Strengths
- Site-level isolation via dedicated suite + fixture per domain.
- Reusable scanner configuration through Playwright fixture extension.
- Practical remediation workflow with spreadsheet artifacts and deduplicated work list.
- Dual reporting support (Playwright + Allure) for both engineering and stakeholder views.

### Current Tradeoffs
- Several suites use global `sheetData` arrays that can mix state if concurrency changes.
- Some fixture files have minimal/empty rule configuration.
- Some filename generation paths are sanitized; others are not.
- Dedupe algorithm in combiner is nested-loop (`O(n²)`) and may slow down at larger scale.

---

## How to Extend the Architecture

To add a new site:

1. Create a fixture: `tests/fixtures/<site>-fixture.ts`
2. Create suite: `tests/<site>.test.ts`
3. Define `baseURL` + `slugs`
4. Add script in `package.json`:
   - `"test:<site>": "PLAYWRIGHT_JSON_OUTPUT_NAME=playwright-report/playwright_results.json npx playwright test tests/<site>.test.ts"`
5. Run tests and (optionally) combine spreadsheets for global triage.

---

## End-to-End Pipeline Summary

```text
Site slugs -> Playwright page visit -> Axe scan (fixture config)
-> Violation flattening -> Per-page spreadsheet output
-> (optional) combine-sheets -> deduped work-list.xlsx
-> remediation workflow
```
