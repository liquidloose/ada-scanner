import { test } from '@playwright/test';
import { defineSiteTests } from './scan-site';

const siteId = process.env.SITE_ID;
if (siteId) {
    defineSiteTests(siteId);
} else {
    test('set SITE_ID to a site id from config/sites.json', () => {
        test.skip(true, 'SITE_ID is not set');
    });
}
