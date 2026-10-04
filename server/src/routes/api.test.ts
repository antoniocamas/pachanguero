import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('GET /api/seasons/current', () => {
  let dir: string;
  let server: Server;
  let base: string;
  let seasons: typeof import('../repo/index.js').seasons;

  beforeAll(async () => {
    // The composition root opens the DB at import time, so point it at a
    // throwaway file first.
    dir = mkdtempSync(join(tmpdir(), 'pachanguero-api-'));
    process.env.PACHANGUERO_DB = join(dir, 'test.db');
    ({ seasons } = await import('../repo/index.js'));
    const { api } = await import('./api.js');
    const app = express();
    app.use(express.json());
    app.use('/api', api);
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as { port: number };
    base = `http://127.0.0.1:${port}/api`;
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null while no season covers today', async () => {
    const res = await fetch(`${base}/seasons/current`);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("returns the season whose Sept-Aug range contains today's date", async () => {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const startYear = month >= 9 ? year : year - 1;
    seasons.create({ name: `${startYear}/${startYear + 1}` });

    const res = await fetch(`${base}/seasons/current`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; starts_on: string };
    expect(body.name).toBe(`${startYear}/${startYear + 1}`);
    expect(body.starts_on).toBe(`${startYear}-09-01`);
  });
});
