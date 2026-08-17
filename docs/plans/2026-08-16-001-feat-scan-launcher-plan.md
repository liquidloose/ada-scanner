---
title: Scan Launcher - Plan
type: feat
date: 2026-08-16
topic: scan-launcher
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Scan Launcher - Plan

## Goal Capsule

- **Objective:** Ron can pick one of the scanner’s existing hardcoded site tests from a dropdown and start that suite with a Run button.
- **Product authority:** This plan owns the launch control panel only. The post-scan scoreboard, screenshots, findings triage, and adding a new site are surrounding work, not active scope.
- **Open blockers:** None.
- **Product Contract preservation:** Product Contract unchanged.

---

## Product Contract

### Summary

A small control panel replaces “run a terminal command” as how Ron starts a scan.
He selects one existing site test from a dropdown and hits Run.
While that suite is running, Run stays locked.

### Problem Frame

Site tests are hardcoded in the scanner and started from npm scripts in a terminal.
Ron sits in front of the results after a scan and asked for a JavaScript dashboard, then reversed the first cut: the missing piece is starting a named suite from the UI, not a scoreboard that you open after Allure.

### Key Decisions

- Launcher first, not the scoreboard. (session-settled: user-directed — chosen over the current-run scoreboard as v1: “actually let’s do the reverse”) Governs R1, R2, R3.
- Dropdown is the existing hardcoded site tests, not a form to add a site. (session-settled: user-directed — chosen over adding a new site in this cut: pick from the list already in the scanner) Governs R2.
- Lock Run while a suite is in progress; no progress view in v1. (session-settled: user-approved — chosen over a progress view: long runs can just disable the button until done) Governs R4, R5, R6.

### How This Work Fits Together

<!-- ce-section: work-relationships -->

This plan owns the scan launcher.
The broader split below is the current understanding, not a committed roadmap.

- Post-scan scoreboard (passed/failed/percent plus work-list violation total)
  - Depends on being able to run a scan
  - Deferred; see Scope Boundaries
- Page screenshots of scanned URLs, and a snapshot of the report
  - Depends on a scan having run
  - Deferred; see Scope Boundaries
- Adding a new site to the scanner
  - Can proceed independently of this launcher
  - Still to decide as its own change to the hardcoded list
- Findings list / grouping by rule, page, template, or site
  - Depends on trustworthy results after a run
  - Deferred; see Scope Boundaries

### Requirements

**Choosing a suite**

- R1. Ron can open a control panel for starting scans without using the terminal as the only way to pick a suite.
- R2. The panel has a dropdown listing every existing site test suite already hardcoded in the scanner.
- R3. The dropdown selection is the suite that Run will start. No extra site URL or slug entry is required.

**Starting a run**

- R4. A Run button starts the selected suite.
- R5. While a suite is running, Run is locked so a second run cannot be started from this panel.
- R6. When the running suite finishes, Run unlocks so Ron can start another selected suite.
- R7. If no suite is selected, Run does not start a scan.

```mermaid
flowchart TB
  subgraph panel[Scan launcher]
    dd[Dropdown of hardcoded site tests]
    run[Run button]
    lock[Run locked while a suite is in progress]
  end
  dd --> run
  run --> lock
  lock --> run
```

### Key Flows

- F1. Start one hardcoded suite
  - **Trigger:** Ron opens the launcher and wants to scan a site already in the scanner.
  - **Steps:** He picks that suite from the dropdown per R2 and R3. He hits Run per R4. Run locks per R5 until the suite finishes, then unlocks per R6.
  - **Outcome:** That suite ran. He can pick another suite and run again.
  - **Covered by:** R1, R2, R3, R4, R5, R6.

### Acceptance Examples

- AE1. Start a selected suite
  - **Covers R2, R3, R4, R5.**
  - **Given:** The dropdown lists the existing hardcoded site tests and one is selected. No suite is currently running.
  - **When:** Ron hits Run.
  - **Then:** That selected suite starts. Run is locked until it finishes.

- AE2. Lock during a long run
  - **Covers R5, R6.**
  - **Given:** A suite is already running from this panel.
  - **When:** Ron tries to hit Run again, including after changing the dropdown.
  - **Then:** Run stays locked and a second suite does not start. After the running suite finishes, Run unlocks.

- AE3. Nothing selected
  - **Covers R7.**
  - **Given:** The dropdown has no suite selected.
  - **When:** Ron hits Run.
  - **Then:** No scan starts.

### Success Criteria

- Ron can start any existing hardcoded site test from the panel instead of remembering the npm script.
- He cannot overlap two runs from this panel.

### Scope Boundaries

**Deferred for later**

- Post-scan scoreboard (passed/failed/percent and work-list violation total)
- Page screenshots of scanned URLs
- Snapshot or export of the report
- Progress, logs, or estimated time while a suite runs
- Findings list and grouping by rule, page, template, or site
- Adding a new site from the UI
- Replacing or removing Allure as an installed reporter

**Outside this product's identity**

- A client-facing compliance packet
- A live crawler that discovers pages beyond the hardcoded slug lists
- Editing fixtures, disabled rules, or page slugs from this panel

### Dependencies / Assumptions

- The site tests already live in the scanner as hardcoded suites. This panel does not invent new sites.
- Starting a suite from the panel has the same effect as running that suite the way Ron already does from the project scripts.
- How the panel is opened and how it invokes the test runner are planning choices, resolved in the Planning Contract.

### Outstanding Questions

- Deferred to Planning: How Ron launches the control panel itself. Resolved as KTD1.
- Deferred to Planning: How the panel starts the selected Playwright suite, including `tests/ada.test.ts`, which has no `test:ada` script today. Resolved as KTD2 and KTD3.

### Sources / Research

- Runnable site scripts today: `test:rivedge`, `test:at-scale`, `test:piezonis`, `test:gnbotf` in `package.json`.
- Site test files: `tests/rivedge.test.ts`, `tests/at-scale.test.ts`, `tests/piezonis.test.ts`, `tests/gnbotf.test.ts`, `tests/ada.test.ts`.
- This artifact supersedes the earlier scoreboard-first cut of the same dashboard brainstorm.
- Allure history/trend JSON exists under `allure-report/history/` and is out of scope for this launcher.
- There is no existing dashboard, HTTP server, or UI test harness in this repo. The launcher is a new local Node surface next to the Playwright suites.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Serve the launcher from a small local Node HTTP server started with `npm run dashboard`. A `file://` page cannot spawn Playwright. Governs the R1 open path.
- KTD2. The server starts a suite by spawning the same Playwright invocation the existing npm scripts use, not a second scanner. Governs R3, R4.
- KTD3. The dropdown includes all five hardcoded suites, including ADA. Add a `test:ada` script so ADA is started the same way as the others. Governs R2.
- KTD4. Single-flight lock lives on the server, not only in the button. A second Run request while a child is live is rejected. The UI disables Run for the life of the in-flight request and re-enables when it finishes. Governs R5, R6, R7.

### Assumptions

- Node on PATH can run `node --test` for the launcher’s own tests. Playwright remains the runner for site scans.
- The dashboard process stays running while a scan is in flight. Closing the tab does not have to kill the child in v1; unlocking Run follows the HTTP request completing.

### Sequencing

U1 (catalog, spawn, lock) then U2 (HTTP + UI + npm scripts).

## Implementation Units

### U1. Suite catalog and single-flight runner

- **Goal:** Name the hardcoded suites and start exactly one Playwright child at a time.
- **Requirements:** R2, R3, R4, R5, R6, R7. Product Key Decisions governing R2–R6. KTD2, KTD3, KTD4.
- **Dependencies:** None.
- **Files:** `dashboard/suites.js`, `dashboard/runner.js`, `dashboard/runner.test.js`
- **Approach:**
  1. Keep a static catalog of the five site suites (id, label, test file).
  2. Start the selected file with the same Playwright JSON output env the npm scripts already set.
  3. Reject unknown ids and empty selection without spawning.
  4. Reject a second start while a child is running; clear the lock when that child exits.
- **Execution note:** Prove lock and spawn-or-not with `node --test` against a fake child, before wiring HTTP.
- **Patterns to follow:** Existing `package.json` `test:*` scripts (`PLAYWRIGHT_JSON_OUTPUT_NAME=playwright-report/playwright_results.json npx playwright test tests/<suite>.test.ts`).
- **Test scenarios:**
  - Covers AE1. Given a known suite id and no running child, start spawns Playwright for that test file and reports busy until it exits.
  - Covers AE2. Given a child already running, a second start does not spawn and reports locked.
  - Covers AE3. Given a missing or unknown id, start does not spawn.
  - After the fake child exits, a later start is allowed.
- **Verification:** `node --test dashboard/runner.test.js` passes. Catalog lists rivedge, at-scale, piezonis, gnbotf, and ada.

### U2. Local dashboard page and npm entry

- **Goal:** Open a page with the suite dropdown and Run button that uses U1.
- **Requirements:** R1, R2, R3, R4, R5, R6, R7. F1. KTD1, KTD4.
- **Dependencies:** U1.
- **Files:** `dashboard/server.js`, `dashboard/index.html`, `dashboard/app.js`, `dashboard/server.test.js`, `package.json`
- **Approach:**
  1. `npm run dashboard` starts the server and serves the launcher page.
  2. The page loads the catalog into a dropdown (placeholder option so R7 can fire).
  3. Run posts the selected id; the server calls U1 and holds the request until the child exits or rejects immediately if locked / invalid.
  4. The button is disabled from click until the request finishes. A 409-style rejection must not start a second suite.
  5. Add `test:ada` next to the other `test:*` scripts.
- **Execution note:** This is mostly wiring; keep server tests on GET catalog, POST run, and lock. Prefer a short runtime smoke of the page load over a full Playwright site scan.
- **Patterns to follow:** Keep `package.json` script style identical to the existing `test:*` entries. Do not add a frontend framework.
- **Test scenarios:**
  - GET of the page returns the launcher HTML.
  - GET of the suite list returns the five hardcoded ids.
  - Covers AE1. POST with a selected id starts a run (fake runner) and stays busy until done.
  - Covers AE2. POST while busy is rejected and does not call start a second time.
  - Covers AE3. POST with empty id does not start a run.
- **Verification:** `node --test dashboard/server.test.js` passes. `npm run dashboard` serves the page. `package.json` has `test:ada` and `dashboard`.

## Verification Contract

- Launcher unit tests: `node --test dashboard/runner.test.js dashboard/server.test.js`
- Smoke: `npm run dashboard` opens a page with five suites and a Run button
- Site scans themselves stay on the existing Playwright scripts; do not gate this feature on a full piezonis run

## Definition of Done

- Dropdown lists all five hardcoded site suites, including ADA
- Run starts the selected suite the same way the npm scripts do
- Run is locked for the life of that child, including a second request from the server
- No scoreboard, screenshots, progress log, or add-site form shipped
- U1 and U2 verification above has passed
