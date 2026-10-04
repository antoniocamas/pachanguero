import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('API', () => {
  let dir: string;
  let server: Server;
  let base: string;
  let seasons: typeof import('../repo/index.js').seasons;
  let aliases: typeof import('../repo/index.js').aliases;

  beforeAll(async () => {
    // The composition root opens the DB at import time, so point it at a
    // throwaway file first.
    dir = mkdtempSync(join(tmpdir(), 'pachanguero-api-'));
    process.env.PACHANGUERO_DB = join(dir, 'test.db');
    ({ seasons, aliases } = await import('../repo/index.js'));
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

  it('GET /seasons/current returns null while no season covers today', async () => {
    const res = await fetch(`${base}/seasons/current`);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("GET /seasons/current returns the season whose Sept-Aug range contains today's date", async () => {
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

  describe('seniority capture', () => {
    const post = (path: string, body: unknown) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    it('suggests a value for a first appearance, then reports hasAppeared', async () => {
      const old = seasons.create({ name: '2018/2019' });
      const now = seasons.create({ name: '2019/2020' });
      const added = await post(`/seasons/${old.id}/players`, {
        name: 'Ana',
        seasons: 3,
      });
      const ana = (await added.json()) as { id: number };

      const first = await fetch(
        `${base}/seasons/${now.id}/players/${ana.id}/seniority-suggestion`
      );
      expect(await first.json()).toEqual({ hasAppeared: false, suggested: 4 });

      const confirmed = await post(
        `/seasons/${now.id}/players/${ana.id}/seniority`,
        {
          seasons: 4,
        }
      );
      expect(confirmed.status).toBe(201);
      expect(await confirmed.json()).toMatchObject({ id: ana.id, seasons: 4 });

      const again = await fetch(
        `${base}/seasons/${now.id}/players/${ana.id}/seniority-suggestion`
      );
      expect(await again.json()).toEqual({ hasAppeared: true });
    });

    it('keeps the first seniority when confirmed twice', async () => {
      const season = seasons.create({ name: '2016/2017' });
      const added = await post(`/seasons/${season.id}/players`, {
        name: 'Beto',
        seasons: 0,
      });
      const beto = (await added.json()) as { id: number };
      await post(`/seasons/${season.id}/players/${beto.id}/seniority`, {
        seasons: 2,
      });
      const second = await post(
        `/seasons/${season.id}/players/${beto.id}/seniority`,
        { seasons: 9 }
      );
      expect(await second.json()).toMatchObject({ seasons: 0 });
    });

    it('rejects a missing seniority value', async () => {
      const season = seasons.create({ name: '2014/2015' });
      const res = await post(`/seasons/${season.id}/players`, { name: 'Cris' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /players/:playerId/aliases', () => {
    const post = (path: string, body: unknown) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    it('saves an alias, and saving it again is harmless', async () => {
      const season = seasons.create({ name: '2012/2013' });
      const added = await post(`/seasons/${season.id}/players`, {
        name: 'Jorge Gutiérrez',
        seasons: 1,
      });
      const { id } = (await added.json()) as { id: number };

      const first = await post(`/players/${id}/aliases`, { alias: ' Guti ' });
      expect(first.status).toBe(201);
      expect(await first.json()).toEqual({ playerId: id, alias: 'Guti' });
      expect(
        (await post(`/players/${id}/aliases`, { alias: 'Guti' })).status
      ).toBe(201);
      expect(aliases.listAll().filter(a => a.playerId === id)).toHaveLength(1);
    });

    it('rejects an unknown player and a blank alias', async () => {
      expect(
        (await post('/players/99999/aliases', { alias: 'X' })).status
      ).toBe(400);
      const season = seasons.create({ name: '2011/2012' });
      const added = await post(`/seasons/${season.id}/players`, {
        name: 'Nora',
        seasons: 1,
      });
      const { id } = (await added.json()) as { id: number };
      expect(
        (await post(`/players/${id}/aliases`, { alias: '  ' })).status
      ).toBe(400);
    });
  });
});
