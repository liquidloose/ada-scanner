import { defaultScanProjects, defaultSitesPath, loadSites } from '../config/sites.js';

export function loadSuites(sitesPath = defaultSitesPath) {
    return loadSites(sitesPath).map((site) => ({
        id: site.id,
        label: site.label || site.id,
        baseURL: site.baseURL,
        script: `test:${site.id}`,
        command: `SITE_ID=${site.id} npx playwright test tests/site.test.ts`,
        testFile: 'tests/site.test.ts',
        projects: site.projects?.length ? site.projects : defaultScanProjects,
    }));
}

export const suites = loadSuites();
