import { test as base } from '@playwright/test';

/**
 * Passthrough routing disables the browser HTTP cache for the context (Playwright behavior).
 * Set DISABLE_HTTP_CACHE=0 to allow normal caching (faster local reruns).
 */
export const test = base.extend({
    page: async ({ page }, use) => {
        if (process.env.DISABLE_HTTP_CACHE !== '0') {
            await page.context().route('**/*', (route) => route.continue());
        }
        await use(page);
    },
});

export { expect } from '@playwright/test';
