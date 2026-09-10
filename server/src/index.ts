import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './routes/api.js';
import { db } from './db/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use('/api', api);

// Serve the built SPA when it exists, so the Pi runs a single process on a
// single port and Caddy only has to reverse-proxy one upstream.
const webDist = join(here, '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';

db(); // open and migrate before accepting traffic
app.listen(port, host, () => {
  console.log(`pachanguero listening on http://${host}:${port}`);
});
