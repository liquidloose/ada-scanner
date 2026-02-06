# TFG ADA - Accessibility Testing Framework

A comprehensive automated accessibility testing suite for multiple websites using Playwright and axe-core. This framework provides site-specific configurations, detailed Excel reports, and visual test reporting through Playwright and Allure.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Running Tests](#running-tests)
- [Understanding Fixtures](#understanding-fixtures)
- [Available Commands](#available-commands)
- [Test Reports](#test-reports)
- [Customizing Tests](#customizing-tests)
- [Workflow Examples](#workflow-examples)
- [Documentation Links](#documentation-links)

---

## Architecture Overview

This framework consists of:

**Test Files** (`tests/*.test.ts`)
- `tfg.test.ts` - The Franchise Group (production site)
- `at-scale.test.ts` - At Scale Conference
- `piezonis.test.ts` - Piezoni's Pizza
- `ada.test.ts` - Local development testing

**Fixture Files** (`tests/fixtures/*-fixture.ts`)
- Site-specific configurations for AxeBuilder
- Prevents configuration drift between environments
- Ensures consistent accessibility scanning rules

**Utility Scripts**
- `combine-sheets.js` - Merges and deduplicates violation reports

---
# TFG ADA - Accessibility Testing Framework

A comprehensive automated accessibility testing suite for multiple websites using Playwright and axe-core. This framework provides site-specific configurations, detailed Excel reports, and visual test reporting through Playwright and Allure.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Running Tests](#running-tests)
- [Understanding Fixtures](#understanding-fixtures)
- [Available Commands](#available-commands)
- [Test Reports](#test-reports)
- [Customizing Tests](#customizing-tests)
- [Workflow Examples](#workflow-examples)
- [Documentation Links](#documentation-links)

---

## Architecture Overview

This framework consists of:

**Test Files** (`tests/*.test.ts`)
- `tfg.test.ts` - The Franchise Group (production site)
- `at-scale.test.ts` - At Scale Conference
- `piezonis.test.ts` - Piezoni's Pizza
- `ada.test.ts` - Local development testing

**Fixture Files** (`tests/fixtures/*-fixture.ts`)
- Site-specific configurations for AxeBuilder
- Prevents configuration drift between environments
- Ensures consistent accessibility scanning rules

**Utility Scripts**
- `utils/combine-sheets.js` - Merges and deduplicates violation reports

---

## Getting Started

### Installation

```bash
npm install
```

### First Run

1. Run tests for a specific site
2. View reports
3. Combine spreadsheets
4. Review unique violations

---

## Running Tests

### Site-Specific Test Commands

#### TFG (The Franchise Group)
```bash
npm run test:tfg
```
Tests thefranchisegroup.com with 46 pages across Desktop Chrome and Mobile Chrome.

**Configuration:**
- Base URL: `https://thefranchisegroup.com`
- Pages: 46 pages (homepage, case studies, team profiles, etc.)
- Browsers: Desktop Chrome, Mobile Chrome
- Fixture: `tfg-fixture.ts` (4 disabled rules)

#### At Scale Conference
```bash
npm run test:at-scale
```
Tests atscaleconference.com with 4 pages.

**Configuration:**
- Base URL: `https://atscaleconference.com`
- Pages: 4 pages (news, speaker submissions, events)
- Browsers: Desktop Chrome, Mobile Chrome
- Fixture: `at-scale-fixture.ts` (4 disabled rules)

#### Piezoni's Pizza
```bash
npm run test:piezonis
```
Tests piezonis.com with 17 pages.

**Configuration:**
- Base URL: `https://piezonis.com`
- Pages: 17 pages (menu, locations, catering, etc.)
- Browsers: Desktop Chrome, Mobile Chrome
- Fixture: `piezonis-fixture.ts` (4 disabled rules)

#### Local Development (ADA)
```bash
npm run test:ada
```
Tests local development server with most permissive rules.

**Configuration:**
- Base URL: `http://192.168.1.17:8001`
- Pages: 8 pages (reduced set for development)
- Browsers: Desktop Chrome, Mobile Chrome
- Fixture: `ada-fixture.ts` (11 disabled rules - most permissive)

---

## Understanding Fixtures

### What Are Fixtures?

Fixtures are **pre-configured test components** that ensure consistent accessibility scanning across all tests. They act as a "contract" that prevents configuration from being accidentally changed.

### Why Use Fixtures?

**Without fixtures:**
```typescript
// Configuration lives in test file (can be lost when copying files)
const results = await new AxeBuilder({ page })
    .exclude('iframe[title="reCAPTCHA"]')
    .disableRules(['landmark-one-main', 'select-name'])
    .analyze();
```

**With fixtures:**
```typescript
// Configuration is locked in the fixture file
const results = await axeScanner.analyze();
```

### Fixture Structure

Each fixture file (`tests/fixtures/*-fixture.ts`) contains:

```typescript
export const test = base.extend<AxeFixture>({
    axeScanner: async ({ page }, use) => {
        const scanner = new AxeBuilder({ page })
            .exclude('iframe[title="reCAPTCHA"], ...')
            .disableRules([
                'landmark-one-main',
                'select-name',
                // ... more rules
            ]);
        
        await use(scanner);
    }
});
```

### What You Can Control in Fixtures

#### 1. Element Exclusions (`.exclude()`)
Ignore specific elements from accessibility scans:
```typescript
.exclude('iframe[title="reCAPTCHA"], .some-class, #some-id')
```

**Use cases:**
- Third-party widgets (reCAPTCHA, chat widgets)
- Known false positives
- Elements being fixed in next sprint

#### 2. Disabled Rules (`.disableRules()`)
Turn off entire accessibility rule types:
```typescript
.disableRules(['landmark-one-main', 'color-contrast', 'region'])
```

**Available rules (common):**
- `landmark-one-main` - Ensures only one main landmark
- `color-contrast` - Text contrast ratio requirements
- `region` - All content in landmark regions
- `link-name` - Links must have text
- `heading-order` - Heading hierarchy (h1→h2→h3)
- `select-name` - Select elements need labels
- `aria-allowed-role` - Valid ARIA roles

Full rule list: https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md

#### 3. WCAG Tags (`.withTags()`)
Specify which WCAG standards to test against:
```typescript
.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
```

**For ADA compliance, use all four tags** (WCAG 2.1 Level AA is current standard).

### Current Fixture Configurations

| Fixture | Site | Disabled Rules | Purpose |
|---------|------|----------------|---------|
| `tfg-fixture.ts` | The Franchise Group | 4 rules | Production site |
| `at-scale-fixture.ts` | At Scale | 4 rules | Production site |
| `piezonis-fixture.ts` | Piezoni's | 4 rules | Production site |
| `ada-fixture.ts` | Local dev | 11 rules | Development (most permissive) |

### Modifying Fixtures

To change accessibility rules for a site:

1. Open the appropriate fixture file (e.g., `tests/fixtures/tfg-fixture.ts`)
2. Modify the `.disableRules()` array:
```typescript
.disableRules([
    'landmark-one-main',
    'select-name',
    'aria-allowed-role',
    'landmark-unique',
    'your-new-rule-here'  // Add new rule
])
```
3. Save the file
4. Run tests - all tests using this fixture will now use the new configuration

**Important:** Fixtures prevent accidental configuration changes when copying test files between computers or branches!

---

## Available Commands

All commands defined in `package.json`:

### Test Execution

| Command | Description |
|---------|-------------|
| `npm run test:tfg` | Run TFG accessibility tests (46 pages) |
| `npm run test:at-scale` | Run At Scale Conference tests (4 pages) |
| `npm run test:piezonis` | Run Piezoni's Pizza tests (17 pages) |

**Output:** 
- Individual Excel files in `spreadsheets/` directory
- One file per page/browser combination
- Playwright JSON results in `playwright-report/`
- Allure results in `allure-results/`

### Report Generation & Viewing

| Command | Description |
|---------|-------------|
| `npm run open-playwright-report` | Open Playwright HTML report in browser |
| `npm run create-allure-report` | Generate Allure report from test results |
| `npm run open-allure-report` | Open Allure report in browser (temporary) |

### Data Management

| Command | Description |
|---------|-------------|
| `npm run combine-spreadsheets` | Merge all Excel files into `work-list.xlsx` with deduplication |
| `npm run delete-spreadsheets` | Delete all reports, spreadsheets, and test artifacts |

**What gets deleted:**
- `allure-results/*` - Raw Allure data
- `allure-report/*` - Generated Allure HTML
- `playwright-report/*` - Playwright HTML/JSON reports
- `spreadsheets/*` - All Excel violation reports

---

## Test Reports

### 1. Individual Excel Spreadsheets

**Location:** `spreadsheets/`

**Format:** `{page-slug}_{browser-name}.xlsx`

**Example:** `case_studies_allianz_trade__Desktop_Chrome.xlsx`

**Contents:**
- Page slug
- Device/browser user agent
- Violation ID (rule type)
- Impact level (critical, serious, moderate, minor)
- WCAG tags
- Description and help text
- Help URL (links to axe documentation)
- HTML snippet
- CSS selector (target)
- Failure summary

### 2. Combined Work List

**File:** `spreadsheets/work-list.xlsx`

**Generated by:** `npm run combine-spreadsheets`

**Features:**
- Deduplicates violations across all pages/browsers
- Keeps only unique violation instances
- Provides master list for remediation tracking

### 3. Playwright HTML Report

**Command:** `npm run open-playwright-report`

**Features:**
- Visual test results
- Pass/fail status per test
- Execution time
- Error messages
- Filterable by browser/status

### 4. Allure Report

**Commands:**
```bash
npm run create-allure-report  # Generate
npm run open-allure-report    # View
```

**Features:**
- Beautiful visualizations
- Timeline view
- Trend analysis
- Test history

**⚠️ Warning:** Allure reports are temporary - take screenshots of important data!

---

## Customizing Tests

### Adding New Pages to Test

Open the test file (e.g., `tests/tfg.test.ts`) and add slugs to the array:

```typescript
const slugs = [
    "",
    "about-us",
    "contact",
    "your-new-page-slug",  // Add here
]
```

### Changing Tested Browsers

Edit `playwright.config.ts`:

```typescript
projects: [
    {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
    },
    {
        name: 'Mobile Chrome',
        use: { ...devices['Pixel 5'] },
    },
    {
        name: 'webkit',  // Uncomment to add Safari
        use: { ...devices['Desktop Safari'] },
    },
]
```

### Adjusting Accessibility Rules

**Option 1: Modify Fixture (Recommended)**
Edit the appropriate fixture file in `tests/fixtures/`:

```typescript
.disableRules([
    'landmark-one-main',
    'select-name',
    'new-rule-to-ignore',  // Add rule
])
```

**Option 2: Temporarily Override in Test**
For one-off testing, override in the test file:

```typescript
const results = await axeScanner
    .disableRules(['additional-rule'])  // Add to fixture rules
    .analyze();
```

---

## Workflow Examples

### Standard Testing Workflow

```bash
# 1. Clean up old results
npm run delete-spreadsheets

# 2. Run tests for your site
npm run test:tfg

# 3. Combine individual reports
npm run combine-spreadsheets

# 4. View combined violations
# Open spreadsheets/work-list.xlsx

# 5. View visual reports
npm run open-playwright-report
```

### Development Workflow

```bash
# 1. Test local development
npm run test:ada

# 2. Check results
npm run open-playwright-report

# 3. Fix violations, then re-test
npm run delete-spreadsheets
npm run test:ada
```

### Multi-Site Testing

```bash
# Test all sites
npm run test:tfg
npm run test:piezonis
npm run test:at-scale

# Combine all results
npm run combine-spreadsheets

# Review master list
# Open spreadsheets/work-list.xlsx
```

---

## Documentation Links

### Core Technologies

- **Playwright:** https://playwright.dev/
  - Test runner and browser automation
  - Configuration: https://playwright.dev/docs/test-configuration

- **axe-core:** https://github.com/dequelabs/axe-core
  - Accessibility testing engine
  - Rule descriptions: https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md

- **@axe-core/playwright:** https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright
  - Playwright integration for axe-core
  - API documentation: https://github.com/dequelabs/axe-core-npm/blob/develop/packages/playwright/README.md

### Standards & Compliance

- **WCAG 2.1 Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/
  - Quick reference guide for WCAG 2.1
  
- **ADA Compliance:** https://www.ada.gov/
  - Americans with Disabilities Act information

- **WebAIM:** https://webaim.org/
  - Web accessibility resources and tools

### Reporting Tools

- **Allure Framework:** https://docs.qameta.io/allure/
  - Test report framework

- **XLSX.js:** https://docs.sheetjs.com/
  - Excel file generation library

---

## Troubleshooting

### Tests Failing with Unexpected Violations

**Problem:** Tests passed before, now failing with many violations.

**Solution:**
1. Check if disabled rules were removed from fixture
2. Delete old spreadsheets: `npm run delete-spreadsheets`
3. Run fresh test
4. Compare fixture configurations between environments

### Spreadsheets Not Combining

**Problem:** `combine-spreadsheets` not finding files.

**Solution:**
1. Ensure tests have been run first
2. Check that `spreadsheets/` directory exists and contains `.xlsx` files
3. Verify all spreadsheet files are closed (not open in Excel)

### Fixture Changes Not Taking Effect

**Problem:** Modified fixture but tests still use old rules.

**Solution:**
1. Verify you edited the correct fixture file
2. Check test file imports the right fixture:
   ```typescript
   import { test, expect } from './fixtures/tfg-fixture';
   ```
3. Restart test runner if running in watch mode

---

## Contributing

When adding new sites or tests:

1. Create a new test file: `tests/your-site.test.ts`
2. Create a new fixture: `tests/fixtures/your-site-fixture.ts`
3. Add npm script to `package.json`:
   ```json
   "test:your-site": "PLAYWRIGHT_JSON_OUTPUT_NAME=playwright-report/playwright_results.json npx playwright test tests/your-site.test.ts"
   ```
4. Document your site-specific configuration in this README

---

## License

ISC