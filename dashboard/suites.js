import { defaultSitesPath, loadSites } from '../config/sites.js';

export function loadSuites(sitesPath = defaultSitesPath) {
    return loadSites(sitesPath).map((site) => ({
        id: site.id,
        label: site.label || site.id,
        script: `test:${site.id}`,
        command: `SITE_ID=${site.id} npx playwright test tests/site.test.ts`,
        testFile: 'tests/site.test.ts',
    }));
}

export const suites = loadSuites();
