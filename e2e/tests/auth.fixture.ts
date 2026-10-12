import { test as base, expect } from '@playwright/test';
import { E2E_ADMIN } from '../support/credentials';

/**
 * The specs act as the end-to-end admin. `request` carries the admin's access token, for the
 * setup calls a test makes straight to the API; `page` is logged in before the test starts,
 * through the same login the screen uses, so its browser context holds the refresh cookie
 * and the app restores the session on load. Each test logs in on its own: a refresh rotates
 * the cookie, so a cookie snapshot shared between contexts would present a revoked token.
 */
export const test = base.extend<object, { adminToken: string }>({
  adminToken: [
    async ({ playwright }, use, workerInfo) => {
      const anonymous = await playwright.request.newContext({
        baseURL: workerInfo.project.use.baseURL,
      });
      const res = await anonymous.post('/api/auth/login', {
        data: E2E_ADMIN,
      });
      expect(res.ok()).toBeTruthy();
      const { accessToken } = (await res.json()) as { accessToken: string };
      await anonymous.dispose();
      await use(accessToken);
    },
    { scope: 'worker' },
  ],

  request: async ({ playwright, adminToken, baseURL }, use) => {
    const context = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
    });
    await use(context);
    await context.dispose();
  },

  page: async ({ page }, use) => {
    const res = await page.request.post('/api/auth/login', {
      data: E2E_ADMIN,
    });
    expect(res.ok()).toBeTruthy();
    await use(page);
  },
});

export { expect };
