export const errorMessages = {
    'no-selection': 'Send a suite id from list_suites.',
    unknown: 'Unknown suite id. Use list_suites for valid ids.',
    busy: 'A scan is already running. Poll get_scan_status until status is finished.',
    timeout: 'Timed out waiting for the scan to finish. Poll get_scan_status again.',
    'no-report': 'No Playwright HTML report is available yet. Run a suite first.',
    'no-spreadsheets': 'No per-page spreadsheet files to combine. Run a suite first.',
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
    if (reason === 'busy') {
        return 409;
    }
    if (reason === 'timeout') {
        return 408;
    }
    if (reason === 'missing' || reason === 'no-report') {
        return 404;
    }
    if (reason === 'invalid') {
        return 403;
    }
    if (reason === 'error') {
        return 500;
    }
    return 400;
}
