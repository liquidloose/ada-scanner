import { test as base } from './playwright-base';
import AxeBuilder from '@axe-core/playwright';

type AxeFixture = {
    axeScanner: AxeBuilder;
};

export const test = base.extend<AxeFixture>({
    axeScanner: async ({ page }, use) => {
        const scanner = new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

        await use(scanner);
    }
});
export { expect } from './playwright-base';