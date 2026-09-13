import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const testDb = join(here, '.tmp/e2e.db');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: `mkdir -p ${dirname(testDb)} && rm -f ${testDb} && npm run dev --workspace=server`,
      cwd: join(here, '..'),
      env: { PACHANGUERO_DB: testDb, PORT: '8787' },
      url: 'http://localhost:8787/api/seasons',
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: 'npm run dev --workspace=web',
      cwd: join(here, '..'),
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 20_000,
    },
  ],
});
