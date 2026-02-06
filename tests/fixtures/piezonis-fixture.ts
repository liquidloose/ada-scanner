import { test as base } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type AxeFixture = {
    axeScanner: AxeBuilder;
};

/**
 * Piezoni's Site-Specific Accessibility Test Fixture
 * 
 * Pre-configured AxeBuilder for piezonis.com with:
 * - reCAPTCHA exclusions
 * - Site-specific rule exceptions
 */
export const test = base.extend<AxeFixture>({
    axeScanner: async ({ page }, use) => {
        const scanner = new AxeBuilder({ page })
            .exclude('iframe[title="reCAPTCHA"], .rc-anchor-pt, .rc-anchor-normal-footer')
            .disableRules([

            ]);

        await use(scanner);
    }
});

export { expect } from '@playwright/test';

