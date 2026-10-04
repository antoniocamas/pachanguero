import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The e2e suite runs its own pair of servers on other ports (see
// e2e/playwright.config.ts) so it never collides with a manual `npm run dev`.
const apiPort = process.env.PACHANGUERO_API_PORT ?? '8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': `http://localhost:${apiPort}` },
  },
});
