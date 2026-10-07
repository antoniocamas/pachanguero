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
  let games: typeof import('../repo/index.js').games;
  let players: typeof import('../repo/index.js').players;
  let participations: typeof import('../repo/index.js').participations;

  beforeAll(async () => {
    // The composition root opens the DB at import time, so point it at a
    // throwaway file first.
    dir = mkdtempSync(join(tmpdir(), 'pachanguero-api-'));
    process.env.PACHANGUERO_DB = join(dir, 'test.db');
    ({ seasons, aliases, games, players, participations } =
      await import('../repo/index.js'));
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

  it("GET /seasons/missing names today's season until it exists", async () => {
    const year = new Date().getFullYear();
    const startYear = new Date().getMonth() + 1 >= 9 ? year : year - 1;
    const before = await fetch(`${base}/seasons/missing`);
    expect(await before.json()).toEqual({
      name: `${startYear}/${startYear + 1}`,
    });
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
    expect(await (await fetch(`${base}/seasons/missing`)).json()).toBeNull();
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

  describe('known players and game removal', () => {
    it('GET /players lists players of every season, enrolled or not', async () => {
      const old = seasons.create({ name: '1980/1981' });
      await fetch(`${base}/seasons/${old.id}/players`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Veterano', seasons: 3 }),
      });
      const next = seasons.create({ name: '1981/1982' });
      expect(
        (await (
          await fetch(`${base}/seasons/${next.id}/players`)
        ).json()) as unknown[]
      ).toEqual([]);
      const known = (await (await fetch(`${base}/players`)).json()) as {
        name: string;
      }[];
      expect(known.map(p => p.name)).toContain('Veterano');
    });

    it('DELETE /games/:id removes the game and what was recorded on it', async () => {
      const season = seasons.create({ name: '1982/1983' });
      const game = games.create(season.id, '1982-10-08');
      await fetch(`${base}/games/${game.id}/candidates`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lines: [{ text: 'Fantasma' }] }),
      });
      const res = await fetch(`${base}/games/${game.id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect((await fetch(`${base}/games/${game.id}`)).status).toBe(404);
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

  describe('/schedule', () => {
    const put = (body: unknown) =>
      fetch(`${base}/schedule`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    it('starts empty, then lists versions oldest first', async () => {
      expect(await (await fetch(`${base}/schedule`)).json()).toEqual([]);

      const wed = await put({
        weekday: 3,
        kickoff_time: '21:00',
        effective_from: '2026-03-02',
      });
      expect(wed.status).toBe(201);
      await put({
        weekday: 1,
        kickoff_time: '22:00',
        effective_from: '2026-01-05',
      });

      const rows = (await (await fetch(`${base}/schedule`)).json()) as {
        weekday: number;
        effective_from: string;
      }[];
      expect(rows.map(r => [r.weekday, r.effective_from])).toEqual([
        [1, '2026-01-05'],
        [3, '2026-03-02'],
      ]);
    });

    it('rejects a repeated effective date and malformed input', async () => {
      expect(
        (
          await put({
            weekday: 2,
            kickoff_time: '20:00',
            effective_from: '2026-01-05',
          })
        ).status
      ).toBe(400);
      expect(
        (
          await put({
            weekday: 7,
            kickoff_time: '20:00',
            effective_from: '2026-05-01',
          })
        ).status
      ).toBe(400);
      expect(
        (
          await put({
            weekday: 2,
            kickoff_time: '8pm',
            effective_from: '2026-05-01',
          })
        ).status
      ).toBe(400);
      expect(
        (
          await put({
            weekday: 2,
            kickoff_time: '20:00',
            effective_from: 'mañana',
          })
        ).status
      ).toBe(400);
    });
  });

  describe('candidate list', () => {
    type Rows = {
      rows: {
        position: number;
        text: string;
        status: string;
        candidate?: { name: string };
        links?: { name?: number; host?: number };
        entry?: { line: unknown; field: string };
      }[];
    };
    const send = (method: string, path: string, body?: unknown) =>
      fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const post = (path: string, body: unknown) => send('POST', path, body);

    it('previews a paste added to the list without storing anything', async () => {
      const season = seasons.create({ name: '2003/2004' });
      const game = games.create(season.id, '2003-10-06');
      await post(`/seasons/${season.id}/players`, { name: 'Ana', seasons: 1 });

      const res = await post(`/games/${game.id}/candidates/preview`, {
        lines: [],
        paste: '1 Ana ⚽\n2 Nueva',
      });
      expect(res.status).toBe(200);
      const { rows } = (await res.json()) as Rows;
      expect(rows.map(r => [r.text, r.status])).toEqual([
        ['Ana', 'matched'],
        ['Nueva', 'unresolved'],
      ]);
      const saved = (await (
        await fetch(`${base}/games/${game.id}/candidates`)
      ).json()) as Rows;
      expect(saved.rows).toEqual([]);
    });

    it('ignores team headings and separator lines in the paste', async () => {
      const season = seasons.create({ name: '2002/2003' });
      const game = games.create(season.id, '2002-10-07');
      await post(`/seasons/${season.id}/players`, {
        name: 'Berta',
        seasons: 1,
      });

      const res = await post(`/games/${game.id}/candidates/preview`, {
        paste: 'Claros\n------------\nBerta\n\nOscuros\n---------\nDesconocido',
      });
      const { rows } = (await res.json()) as Rows;
      expect(rows.map(r => r.text)).toEqual(['Berta', 'Desconocido']);
    });

    it('saves the list, which is there again on the next load', async () => {
      const season = seasons.create({ name: '2004/2005' });
      const game = games.create(season.id, '2004-10-06');
      await post(`/seasons/${season.id}/players`, { name: 'Gema', seasons: 1 });
      const url = `/games/${game.id}/candidates`;

      const put = await send('PUT', url, {
        lines: [{ text: 'Gema' }, { text: 'Desconocido' }],
      });
      expect(put.status).toBe(200);

      const { rows } = (await (await fetch(`${base}${url}`)).json()) as Rows;
      expect(rows.map(r => [r.position, r.text, r.status])).toEqual([
        [1, 'Gema', 'matched'],
        [2, 'Desconocido', 'unresolved'],
      ]);
      const detail = (await (
        await fetch(`${base}/games/${game.id}`)
      ).json()) as { participations: { name: string; signed_up: number }[] };
      expect(
        detail.participations.filter(p => p.signed_up).map(p => p.name)
      ).toEqual(['Gema']);
    });

    it('settles an unresolved name, which then reads as matched', async () => {
      const season = seasons.create({ name: '1971/1972' });
      const game = games.create(season.id, '1971-10-08');
      const { rows } = (await (
        await post(`/games/${game.id}/candidates/preview`, { paste: 'Nueva' })
      ).json()) as Rows;

      const resolved = await post(`/games/${game.id}/candidates/resolve`, {
        ...rows[0].entry,
        action: { type: 'register', name: 'Nueva' },
      });
      expect(resolved.status).toBe(200);
      expect(await resolved.json()).toEqual({ outcome: 'resolved' });

      const again = (await (
        await post(`/games/${game.id}/candidates/preview`, {
          lines: [{ text: 'Nueva' }],
        })
      ).json()) as Rows;
      expect(again.rows[0]).toMatchObject({ status: 'matched' });
    });

    it("keeps the organiser's choice for an ambiguous name through a save and a reload", async () => {
      const season = seasons.create({ name: '1973/1974' });
      const game = games.create(season.id, '1973-10-08');
      const juanito = await (
        await post(`/seasons/${season.id}/players`, {
          name: 'Juanito',
          seasons: 1,
        })
      ).json();
      const juan = await (
        await post(`/seasons/${season.id}/players`, {
          name: 'Juan',
          seasons: 1,
        })
      ).json();
      await post(`/players/${juan.id}/aliases`, { alias: 'Juanito' });

      const open = (await (
        await post(`/games/${game.id}/candidates/preview`, { paste: 'Juanito' })
      ).json()) as Rows;
      expect(open.rows[0].status).toBe('unresolved');

      await send('PUT', `/games/${game.id}/candidates`, {
        lines: [{ text: 'Juanito', links: { name: juanito.id } }],
      });
      const { rows } = (await (
        await fetch(`${base}/games/${game.id}/candidates`)
      ).json()) as Rows;
      expect(rows[0]).toMatchObject({
        status: 'matched',
        links: { name: juanito.id },
        candidate: { name: 'Juanito' },
      });
    });

    it('keeps a name registered with its host as that host guest through a save', async () => {
      const season = seasons.create({ name: '1975/1976' });
      const game = games.create(season.id, '1975-10-08');
      const host = await (
        await post(`/seasons/${season.id}/players`, {
          name: 'Anfitriona',
          seasons: 1,
        })
      ).json();
      const { rows } = (await (
        await post(`/games/${game.id}/candidates/preview`, {
          paste: 'Invitada (Anfitriona)',
        })
      ).json()) as Rows;
      await post(`/games/${game.id}/candidates/resolve`, {
        ...rows[0].entry,
        action: { type: 'register', name: 'Invitada', introducedBy: host.id },
      });

      await send('PUT', `/games/${game.id}/candidates`, {
        lines: [
          { text: 'Anfitriona' },
          { text: 'Invitada (Anfitriona)', introduced: true },
        ],
      });

      const guest = (await (
        await fetch(`${base}/games/${game.id}/candidates`)
      ).json()) as {
        rows: { candidate: { guest: string | null; hostPlayerId: number } }[];
      };
      expect(guest.rows[1].candidate).toMatchObject({
        guest: 'named',
        hostPlayerId: host.id,
      });
    });

    it('rejects malformed lines and an unknown game', async () => {
      const season = seasons.create({ name: '1972/1973' });
      const game = games.create(season.id, '1972-10-09');
      expect(
        (await send('PUT', `/games/${game.id}/candidates`, { lines: 'Ana' }))
          .status
      ).toBe(400);
      expect(
        (await post(`/games/${game.id}/candidates/preview`, { lines: [1] }))
          .status
      ).toBe(400);
      expect(
        (
          await post(`/games/${game.id}/candidates/preview`, {
            lines: [{ text: 'Ana', links: { name: 'x' } }],
          })
        ).status
      ).toBe(400);
      expect(
        (await send('PUT', '/games/99999/candidates', { lines: [] })).status
      ).toBe(400);
      const res = await post('/games/99999/candidates/resolve', {
        line: { position: 1, kind: 'plain', name: 'X' },
        action: { type: 'register', name: 'X' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /games', () => {
    const post = (path: string, body: unknown) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    it("puts a past game in the season its date falls in, not today's", async () => {
      seasons.create({ name: '1991/1992' });
      const middle = seasons.create({ name: '1992/1993' });
      seasons.create({ name: '1993/1994' });

      const res = await post('/games', { played_on: '1992-11-04' });
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        season_id: middle.id,
        played_on: '1992-11-04',
      });
    });

    it('refuses a date no season covers, naming it', async () => {
      const res = await post('/games', { played_on: '1980-03-05' });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toContain(
        '1980-03-05'
      );
    });

    it('refuses a malformed date', async () => {
      expect((await post('/games', { played_on: 'ayer' })).status).toBe(400);
      expect((await post('/games', {})).status).toBe(400);
    });

    it('no longer lets the caller pick the season', async () => {
      const season = seasons.create({ name: '1994/1995' });
      const res = await post(`/seasons/${season.id}/games`, {
        played_on: '1994-10-01',
      });
      expect(res.status).toBe(404);
    });

    it("records a past game in its own season, with that season's price", async () => {
      seasons.create({ name: '1989/1990' });
      const past = seasons.create({ name: '1990/1991' });
      seasons.update(past.id, { price_cents: 8000 });

      const created = await post('/games', { played_on: '1990-11-07' });
      expect(created.status).toBe(201);
      const game = (await created.json()) as { id: number; season_id: number };
      expect(game.season_id).toBe(past.id);

      // Nothing was ever selected for it.
      expect(
        await (await fetch(`${base}/games/${game.id}`)).json()
      ).toMatchObject({ convocatoria: null });
    });
  });

  describe('game lifecycle', () => {
    const send = (method: string, path: string, body?: unknown) =>
      fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let seasonId: number;
    let nextDay = 1;
    const newGame = (status: Parameters<typeof games.setState>[1] = 'open') => {
      const day = String(nextDay++).padStart(2, '0');
      const game = games.create(seasonId, `2041-10-${day}`);
      if (status !== 'open') games.setState(game.id, status);
      return game.id;
    };

    beforeAll(() => {
      seasonId = seasons.create({ name: '2041/2042' }).id;
    });

    it('GET /games/:id says the state and the next action', async () => {
      const gameId = newGame('convocatoria_created');
      const body = await (await send('GET', `/games/${gameId}`)).json();
      expect(body).toMatchObject({
        state: 'convocatoria_created',
        nextAction: 'Confirmar convocatoria',
      });
    });

    it('POST /games/:id/state refuses play before the convocatoria is confirmed', async () => {
      const gameId = newGame();
      const res = await send('POST', `/games/${gameId}/state`, {
        action: 'play',
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(
        'Confirma la convocatoria antes de marcar el partido como jugado'
      );
      expect(games.get(gameId)?.status).toBe('open');
    });

    it('play, reopen, cancel and uncancel move the game and remember where it was', async () => {
      const gameId = newGame('convocatoria_confirmed');
      const act = async (action: string) =>
        (await send('POST', `/games/${gameId}/state`, { action })).json();
      expect((await act('play')).state).toBe('played');
      expect((await act('reopen')).state).toBe('convocatoria_confirmed');
      expect((await act('cancel')).state).toBe('cancelled');
      expect(games.get(gameId)?.cancelled_from).toBe('convocatoria_confirmed');
      expect((await act('uncancel')).state).toBe('convocatoria_confirmed');
      expect(games.get(gameId)?.cancelled_from).toBeNull();
    });

    it('creating and confirming the convocatoria are not state actions', async () => {
      const gameId = newGame();
      const res = await send('POST', `/games/${gameId}/state`, {
        action: 'create',
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Acción no válida');
    });

    it('PATCH /games/:id changes the plain fields and ignores status', async () => {
      const gameId = newGame();
      const res = await send('PATCH', `/games/${gameId}`, {
        status: 'played',
        cancelled_from: 'open',
        label: 'Bis',
      });
      expect(await res.json()).toMatchObject({ status: 'open', label: 'Bis' });
      expect(games.get(gameId)?.cancelled_from).toBeNull();
    });

    it.each(['played', 'cancelled'] as const)(
      'a %s game refuses a candidate save and a sign-up change',
      async status => {
        const gameId = newGame(status === 'played' ? 'played' : 'open');
        if (status === 'cancelled') games.setState(gameId, 'cancelled', 'open');
        const saved = await send('PUT', `/games/${gameId}/candidates`, {
          lines: [],
        });
        expect(saved.status).toBe(400);
        const put = await send('PUT', `/games/${gameId}/players/1`, {
          signed_up: true,
        });
        expect(put.status).toBe(400);
        const del = await send('DELETE', `/games/${gameId}/players/1`);
        expect(del.status).toBe(400);
        expect((await del.json()).error).toBe(
          status === 'played'
            ? 'Reabre el partido para editarlo'
            : 'El partido está cancelado'
        );
      }
    );
  });
  describe('convocatoria', () => {
    const send = (method: string, path: string, body?: unknown) =>
      fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let seasonId: number;
    let nextDay = 1;
    /** A game with `count` regulars signed up. */
    const gameWith = (count: number) => {
      const day = String(nextDay++).padStart(2, '0');
      const game = games.create(seasonId, `2043-10-${day}`);
      const ids = Array.from({ length: count }, (_, i) => {
        const p = players.add(seasonId, `C${game.id}-${i}`, 1);
        participations.set(game.id, p.id, { signed_up: true });
        return p.id;
      });
      return { gameId: game.id, ids };
    };
    const detail = async (gameId: number) =>
      (await send('GET', `/games/${gameId}`)).json();

    beforeAll(() => {
      seasonId = seasons.create({ name: '2043/2044' }).id;
    });

    it('create stores the convocatoria and moves the game to created; confirm stamps it', async () => {
      const { gameId } = gameWith(16);

      const created = await send('POST', `/games/${gameId}/convocatoria`, {});
      expect(created.status).toBe(200);
      expect(await detail(gameId)).toMatchObject({
        state: 'convocatoria_created',
        nextAction: 'Confirmar convocatoria',
        convocatoria: { confirmed_at: null, source: 'generated' },
      });

      const confirmed = await send(
        'POST',
        `/games/${gameId}/convocatoria/confirm`
      );
      expect((await confirmed.json()).confirmed_at).not.toBeNull();
      expect(await detail(gameId)).toMatchObject({
        state: 'convocatoria_confirmed',
        nextAction: 'Marcar como jugado',
      });
    });

    it('create refuses with nobody signed up and confirm refuses before creating', async () => {
      const { gameId } = gameWith(0);
      const none = await send('POST', `/games/${gameId}/convocatoria`, {});
      expect(none.status).toBe(400);
      expect((await none.json()).error).toBe('No hay nadie apuntado');
      const early = await send('POST', `/games/${gameId}/convocatoria/confirm`);
      expect((await early.json()).error).toBe(
        'Crea la convocatoria antes de confirmarla'
      );
    });

    it('moves a member by hand, refuses the 15th, and recreating asks before discarding the correction', async () => {
      const { gameId } = gameWith(16);
      await send('POST', `/games/${gameId}/convocatoria`, {});
      type Entry = {
        player_id: number;
        playing: number;
        changed_by_hand: boolean;
      };
      const entries = async (): Promise<Entry[]> =>
        (await detail(gameId)).convocatoria.entries;
      const reserve = (await entries()).find(e => e.playing === 0)!.player_id;
      const member = (await entries()).find(e => e.playing === 1)!.player_id;
      const move = (playerId: number, playing: boolean) =>
        send('PUT', `/games/${gameId}/convocatoria/members`, {
          member: { playerId },
          playing,
        });

      const full = await move(reserve, true);
      expect(full.status).toBe(400);
      expect((await full.json()).error).toBe('No quedan plazas');

      expect((await move(member, false)).status).toBe(200);
      expect((await move(reserve, true)).status).toBe(200);
      expect((await entries()).filter(e => e.changed_by_hand)).toHaveLength(2);

      const again = await send('POST', `/games/${gameId}/convocatoria`, {});
      expect((await again.json()).error).toBe('Se perderán tus correcciones');
      const forced = await send('POST', `/games/${gameId}/convocatoria`, {
        discardEdits: true,
      });
      expect(forced.status).toBe(200);
    });

    it('moves an anonymous plus-one by its host and ordinal', async () => {
      const { gameId, ids } = gameWith(13);
      const { guests } = await import('../repo/index.js').then(m => ({
        guests: m.guestCandidates,
      }));
      guests.put(gameId, {
        position: 14,
        player_id: null,
        host_player_id: ids[0],
      });
      await send('POST', `/games/${gameId}/convocatoria`, {});
      const out = await send('PUT', `/games/${gameId}/convocatoria/members`, {
        member: { hostPlayerId: ids[0], ordinal: 1 },
        playing: false,
      });
      expect(out.status).toBe(200);
      const guest = (await detail(gameId)).convocatoria.entries.find(
        (e: { player_id: number | null }) => e.player_id === null
      );
      expect(guest).toMatchObject({
        playing: 0,
        name: expect.stringContaining('Invitado de'),
      });
    });

    it('refuses an unreadable member or playing value', async () => {
      const { gameId } = gameWith(2);
      await send('POST', `/games/${gameId}/convocatoria`, {});
      const noMember = await send(
        'PUT',
        `/games/${gameId}/convocatoria/members`,
        {
          playing: true,
        }
      );
      expect(noMember.status).toBe(400);
      const noFlag = await send(
        'PUT',
        `/games/${gameId}/convocatoria/members`,
        {
          member: { playerId: 1 },
        }
      );
      expect(noFlag.status).toBe(400);
    });

    it('refuses to sign out someone who is playing, by PUT and by DELETE', async () => {
      const { gameId, ids } = gameWith(3);
      await send('POST', `/games/${gameId}/convocatoria`, {});
      const put = await send('PUT', `/games/${gameId}/players/${ids[0]}`, {
        signed_up: false,
      });
      expect((await put.json()).error).toBe(
        'Quítalo primero de la convocatoria'
      );
      const del = await send('DELETE', `/games/${gameId}/players/${ids[0]}`);
      expect((await del.json()).error).toBe(
        'Quítalo primero de la convocatoria'
      );
      expect(
        participations.list(gameId).find(p => p.player_id === ids[0])?.signed_up
      ).toBe(1);
    });

    it('a game dated in the past walks open to played with no special case', async () => {
      const created = await send('POST', '/games', { played_on: '2043-11-12' });
      const game = (await created.json()) as { id: number };
      const ids = Array.from({ length: 14 }, (_, i) => {
        const p = players.add(seasonId, `Past${i}`, 1);
        participations.set(game.id, p.id, { signed_up: true });
        return p.id;
      });
      void ids;
      await send('POST', `/games/${game.id}/convocatoria`, {});
      await send('POST', `/games/${game.id}/convocatoria/confirm`);
      const played = await send('POST', `/games/${game.id}/state`, {
        action: 'play',
      });
      expect((await played.json()).state).toBe('played');
    });
  });

  describe('payments', () => {
    const send = (method: string, path: string, body?: unknown) =>
      fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let gameId: number;
    let ana: number;
    let bea: number;

    beforeAll(async () => {
      const seasonId = seasons.create({ name: '2046/2047' }).id;
      gameId = games.create(seasonId, '2046-10-07').id;
      [ana, bea] = ['Ana', 'Bea'].map(name => {
        const p = players.add(seasonId, `Pay${name}`, 1);
        participations.set(gameId, p.id, { signed_up: true });
        return p.id;
      });
      await send('POST', `/games/${gameId}/convocatoria`, {});
      await send('POST', `/games/${gameId}/convocatoria/confirm`);
    });

    it('refuses payment before the game is played', async () => {
      const res = await send('POST', `/games/${gameId}/payments`, {
        shares: [{ playerId: ana }],
        payerPlayerId: ana,
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('jugado');
    });

    it('bills on play, settles a share and puts it back on undo', async () => {
      await send('POST', `/games/${gameId}/state`, { action: 'play' });
      const billed = await (await send('GET', `/games/${gameId}`)).json();
      expect(billed.debts).toHaveLength(2);

      const paid = await send('POST', `/games/${gameId}/payments`, {
        shares: [{ playerId: ana }],
        payerPlayerId: ana,
        paidOn: '2046-10-08',
      });
      expect(paid.status).toBe(201);
      const afterPay = await paid.json();
      expect(afterPay.debts).toHaveLength(1);
      expect(afterPay.payments[0]).toMatchObject({
        beneficiary_player_id: ana,
        amount_cents: 400,
        paid_on: '2046-10-08',
      });

      const undone = await send(
        'DELETE',
        `/games/${gameId}/payments/${afterPay.payments[0].id}`
      );
      expect((await undone.json()).debts).toHaveLength(2);
    });

    it('refuses a share nobody can name and a payer who does not owe it', async () => {
      const unnamed = await send('POST', `/games/${gameId}/payments`, {
        shares: [{}],
        payerPlayerId: ana,
      });
      expect(unnamed.status).toBe(400);

      const wrongPayer = await send('POST', `/games/${gameId}/payments`, {
        shares: [{ playerId: ana }],
        payerPlayerId: bea,
      });
      expect((await wrongPayer.json()).error).toContain('Solo puede pagar');
    });
  });

  describe('teams', () => {
    const send = (method: string, path: string, body?: unknown) =>
      fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let gameId: number;
    let names: string[];

    beforeAll(async () => {
      const seasonId = seasons.create({ name: '2047/2048' }).id;
      gameId = games.create(seasonId, '2047-10-07').id;
      names = ['Uno', 'Dos'].map(name => {
        const p = players.add(seasonId, `Team${name}`, 1);
        participations.set(gameId, p.id, { signed_up: true });
        return p.name;
      });
      await send('POST', `/games/${gameId}/convocatoria`, {});
      await send('POST', `/games/${gameId}/convocatoria/confirm`);
    });

    const paste = () =>
      send('POST', `/games/${gameId}/teams/paste`, {
        text: `Claros\n-----\n${names[0]}\nOscuros\n-----\n${names[1]}`,
      });

    it('refuses a paste before the game is played', async () => {
      const res = await paste();
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(
        'Marca el partido como jugado antes de pegar los equipos'
      );
    });

    it('a paste sets only the team, and GET and PUT read and replace it', async () => {
      await send('POST', `/games/${gameId}/state`, { action: 'play' });
      const before = (await participations.list(gameId)).map(
        ({ team: _team, ...rest }) => rest
      );

      const res = await paste();
      expect(res.status).toBe(200);
      expect((await res.json()).matched).toHaveLength(2);
      expect(
        participations.list(gameId).map(({ team: _team, ...rest }) => rest)
      ).toEqual(before);

      const teams = await (await send('GET', `/games/${gameId}/teams`)).json();
      expect(teams.map((t: { team: string }) => t.team).sort()).toEqual([
        'claros',
        'oscuros',
      ]);

      const swapped = teams.map((t: { playerId: number; team: string }) => ({
        playerId: t.playerId,
        team: t.team === 'claros' ? 'oscuros' : 'claros',
      }));
      const put = await send('PUT', `/games/${gameId}/teams`, {
        assignments: swapped,
      });
      expect(await put.json()).toEqual(swapped);
    });
  });

  describe('GET /games/:id for the game screen', () => {
    const send = (method: string, path: string, body?: unknown) =>
      fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const view = async () => (await send('GET', `/games/${gameId}`)).json();
    let gameId: number;
    let ids: number[];

    beforeAll(async () => {
      const seasonId = seasons.create({ name: '2048/2049' }).id;
      gameId = games.create(seasonId, '2048-10-07').id;
      ids = ['Ana', 'Bea', 'Cai'].map(name => {
        const p = players.add(seasonId, `View${name}`, 1);
        return p.id;
      });
    });

    it('in an open game gives the arrival order of the saved list and no convocatoria', async () => {
      await send('PUT', `/games/${gameId}/candidates`, {
        lines: [
          { text: 'ViewCai' },
          { text: 'ViewAna' },
          { text: 'ViewAna +1' },
        ],
      });

      const open = await view();

      expect(open.state).toBe('open');
      expect(open.convocatoria).toBeNull();
      expect(
        open.arrivals.map((a: { position: number }) => a.position)
      ).toEqual([1, 2, 3]);
      expect(open.arrivals[0]).toMatchObject({ playerId: ids[2] });
      expect(open.arrivals[2]).toMatchObject({
        playerId: null,
        hostPlayerId: ids[0],
        guest: 'anonymous',
      });
      expect(Object.keys(open.points).map(Number).sort()).toEqual(
        [...ids].sort()
      );
    });

    it('walks created, confirmed and played, each saying its state and next action', async () => {
      await send('POST', `/games/${gameId}/convocatoria`, {});
      const created = await view();
      expect(created.state).toBe('convocatoria_created');
      expect(created.convocatoria.entries).toHaveLength(3);
      expect(created.nextAction).toEqual(expect.any(String));

      await send('POST', `/games/${gameId}/convocatoria/confirm`);
      expect((await view()).state).toBe('convocatoria_confirmed');

      await send('POST', `/games/${gameId}/state`, { action: 'play' });
      const played = await view();
      expect(played.state).toBe('played');
      expect(played.debts).toHaveLength(3);
      expect(played.payments).toEqual([]);
    });

    it('in a cancelled game says where it was cancelled from', async () => {
      await send('POST', `/games/${gameId}/state`, { action: 'cancel' });

      const cancelled = await view();

      expect(cancelled.state).toBe('cancelled');
      expect(cancelled.game.cancelled_from).toBe('played');
    });

    it('answers 404 for a game that does not exist', async () => {
      expect((await send('GET', '/games/999999')).status).toBe(404);
    });
  });
});
