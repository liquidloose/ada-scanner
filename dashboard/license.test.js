import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLicense, licenseStatus } from './license.js';

test('missing expiry is allowed', () => {
    assert.deepEqual(licenseStatus(Date.now(), undefined), { ok: true, expires: null });
    assert.deepEqual(licenseStatus(Date.now(), ''), { ok: true, expires: null });
});

test('future date is allowed and past date expires', () => {
    const now = Date.parse('2026-08-17T00:00:00Z');
    assert.deepEqual(licenseStatus(now, '2027-12-31'), { ok: true, expires: '2027-12-31' });
    assert.deepEqual(licenseStatus(now, '2020-01-01'), {
        ok: false,
        reason: 'expired',
        expires: '2020-01-01',
    });
    assert.equal(licenseStatus(now, 'not-a-date').reason, 'invalid');
});

test('assertLicense exits when expired', () => {
    const previous = process.env.ADA_SCANNER_EXPIRES;
    process.env.ADA_SCANNER_EXPIRES = '2000-01-01';
    const codes = [];
    try {
        assertLicense((code) => codes.push(code));
        assert.deepEqual(codes, [1]);
    } finally {
        if (previous === undefined) {
            delete process.env.ADA_SCANNER_EXPIRES;
        } else {
            process.env.ADA_SCANNER_EXPIRES = previous;
        }
    }
});
