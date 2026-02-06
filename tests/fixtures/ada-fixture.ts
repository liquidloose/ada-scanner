import { test as base } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type AxeFixture = {
    axeScanner: AxeBuilder;
};

/**
 * ADA Local Development Site-Specific Accessibility Test Fixture
 * 
 * Pre-configured AxeBuilder for localhost:8001 with:
 * - reCAPTCHA exclusions
 * - Extended rule exceptions (more permissive for development)
 */
export const test = base.extend<AxeFixture>({
    axeScanner: async ({ page }, use) => {
        const scanner = new AxeBuilder({ page })
            .exclude('iframe[title="reCAPTCHA"], .rc-anchor-normal-footer > .rc-anchor-pt > a:nth-child(1)')
            .disableRules([
                'landmark-one-main',
                'heading-order',
                'select-name',
                'aria-allowed-role',
                'landmark-unique',
                'region',
                'color-contrast',
                'link-name',
                'landmark-no-duplicate-banner',
                'page-has-heading-one',
                'link-in-text-block'
            ]);

        await use(scanner);
    }
});

export { expect } from '@playwright/test';
