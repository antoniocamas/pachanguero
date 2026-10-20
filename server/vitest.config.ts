import { configDefaults, defineConfig } from 'vitest/config';

// `npm test` never touches the bank's sandbox: its suite is opt-in, run by `npm run test:sandbox`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.sandbox.test.ts'],
  },
});
