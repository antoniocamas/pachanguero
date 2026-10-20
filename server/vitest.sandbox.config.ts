import { defineConfig } from 'vitest/config';

// The opt-in suite against the bank's sandbox, from a standing session (`npm run test:sandbox`).
export default defineConfig({
  test: {
    reporters: ['verbose'],
    include: ['src/**/*.sandbox.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
