import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { E2E_JWT_SECRET } from './support/credentials';

const here = dirname(fileURLToPath(import.meta.url));
// Not the dev ports (8787/5173): a manual `npm run dev` can stay up while the
// suite runs, each with its own database.
const apiPort = 8788;
const webPort = 5174;
const testDb = join(here, '.tmp/e2e.db');
// Read by the setup that creates the end-to-end admin, which must use the same database.
process.env.E2E_DB = testDb;

export default defineConfig({
  testDir: './tests',
  // Runs once the servers are up: creates the admin the specs log in as.
  globalSetup: './support/seed-admin.ts',
  fullyParallel: false,
  // The specs share one database, so they run one after the other.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: `mkdir -p ${dirname(testDb)} && rm -f ${testDb} ${testDb}-wal ${testDb}-shm && npm run dev --workspace=server`,
      cwd: join(here, '..'),
      env: {
        PACHANGUERO_DB: testDb,
        PORT: String(apiPort),
        JWT_SECRET: E2E_JWT_SECRET,
      },
      url: `http://localhost:${apiPort}/api/seasons`,
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: 'npm run dev --workspace=web',
      cwd: join(here, '..'),
      env: { PORT: String(webPort), PACHANGUERO_API_PORT: String(apiPort) },
      url: `http://localhost:${webPort}`,
      reuseExistingServer: false,
      timeout: 20_000,
    },
  ],
});
