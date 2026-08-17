import { test as base } from './playwright-base';
import AxeBuilder from '@axe-core/playwright';

type AxeFixture = {
    axeScanner: AxeBuilder;
};

/**
 * River's Edge Site-Specific Accessibility Test Fixture
 *
 * Pre-configured AxeBuilder for rivedge-site.ferret-boa.ts.net with
 * standard WCAG 2.0/2.1 A + AA tags. No exclusions yet — add site-specific
 * false-positive selectors here as they are identified.
 */
export const test = base.extend<AxeFixture>({
    axeScanner: async ({ page }, use) => {
        const scanner = new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

        await use(scanner);
    }
});

export { expect } from './playwright-base';
