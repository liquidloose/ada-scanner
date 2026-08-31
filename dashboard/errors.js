export const errorMessages = {
    'no-selection': 'Send a suite id from list_suites.',
    'no-projects': 'Select at least one browser or device.',
    'unknown-project': 'Unknown browser or device. Use Desktop Chrome, Mobile Chrome, macOS Safari, iOS Safari, or iPad.',
    unknown: 'Unknown suite id. Use list_suites for valid ids.',
    busy: 'A scan is already running. Poll get_scan_status until status is finished, or call stop_scan if it is hung.',
    timeout: 'Timed out waiting for the scan to finish. Poll get_scan_status again.',
    'no-report': 'No Playwright HTML report is available yet. Run a suite first.',
    'no-allure-results': 'No Allure results yet. Run a suite first, then create an Allure report.',
    'allure-failed': 'Allure could not generate the report.',
    'no-spreadsheets': 'No per-page spreadsheet files to combine. Run a suite first.',
    'no-scan-data': 'Nothing to save. Run a scan first, or keep the current report and spreadsheets.',
    'invalid-site': 'Enter a valid http(s) site URL.',
    'site-exists': 'That site is already in the list.',
    'keep-one-slug': 'Keep at least one page so the site can still be scanned.',
    missing: 'That spreadsheet file was not found.',
    invalid: 'Spreadsheet name must be a .xlsx file basename, with no path.',
    error: 'The server hit an unexpected error.',
};

export function errorBody(reason) {
    return {
        ok: false,
        reason,
        message: errorMessages[reason] ?? reason,
    };
}

export function errorStatus(reason) {
    if (reason === 'busy' || reason === 'site-exists') {
        return 409;
    }
    if (reason === 'timeout') {
        return 408;
    }
    if (reason === 'missing' || reason === 'no-report') {
        return 404;
    }
    if (reason === 'allure-failed') {
        return 500;
    }
    if (reason === 'invalid') {
        return 403;
    }
    if (reason === 'error') {
        return 500;
    }
    return 400;
}
