import { test as base } from './playwright-base';
import AxeBuilder from '@axe-core/playwright';
import { getSite } from '../site-config';

const defaultTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

type AxeFixture = {
    axeScanner: AxeBuilder;
};

export const test = base.extend<AxeFixture>({
    axeScanner: async ({ page }, use) => {
        const site = getSite(process.env.SITE_ID);
        let scanner = new AxeBuilder({ page });
        const tags = site.axe?.tags?.length ? site.axe.tags : defaultTags;
        scanner = scanner.withTags(tags);
        for (const selector of site.axe?.exclude ?? []) {
            scanner = scanner.exclude(selector);
        }
        if (site.axe?.disableRules?.length) {
            scanner = scanner.disableRules(site.axe.disableRules);
        }
        await use(scanner);
    },
});

export { expect } from './playwright-base';
