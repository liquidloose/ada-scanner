export function licenseStatus(now = Date.now(), expires = process.env.ADA_SCANNER_EXPIRES) {
    if (!expires) {
        return { ok: true, expires: null };
    }

    const stamp = /^\d{4}-\d{2}-\d{2}$/.test(expires) ? `${expires}T23:59:59.999Z` : expires;
    const end = Date.parse(stamp);
    if (Number.isNaN(end)) {
        return { ok: false, reason: 'invalid', expires };
    }
    if (now > end) {
        return { ok: false, reason: 'expired', expires };
    }
    return { ok: true, expires };
}

export function assertLicense(exit = process.exit) {
    const status = licenseStatus();
    if (status.ok) {
        return status;
    }
    if (status.reason === 'invalid') {
        console.error('ADA_SCANNER_EXPIRES must be YYYY-MM-DD');
    } else {
        console.error(`ADA Scanner license expired on ${status.expires}`);
    }
    exit(1);
    return status;
}
