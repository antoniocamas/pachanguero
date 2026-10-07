import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from './test-support.js';

describe('schema.sql', () => {
  let conn: Database.Database;
  let gameId: number;
  let ana: number;
  let beto: number;

  const run = (sql: string, ...params: unknown[]) =>
    Number(conn.prepare(sql).run(...params).lastInsertRowid);

  beforeEach(() => {
    conn = TestDatabase.create();
    const season = run(
      `INSERT INTO seasons (name, starts_on, ends_on) VALUES ('2025/2026','2025-09-01','2026-08-31')`
    );
    gameId = run(
      `INSERT INTO games (season_id, played_on) VALUES (?, '2025-09-10')`,
      season
    );
    ana = run(`INSERT INTO players (name) VALUES ('Ana')`);
    beto = run(`INSERT INTO players (name) VALUES ('Beto')`);
  });

  describe('participations', () => {
    it('has no guests column: plus-ones live in the candidate list', () => {
      const columns = conn
        .prepare('PRAGMA table_info(participations)')
        .all() as Array<{ name: string }>;
      expect(columns.map(c => c.name)).not.toContain('guests');
    });
  });

  describe('games', () => {
    it('accepts every state of the lifecycle', () => {
      for (const status of [
        'open',
        'convocatoria_created',
        'convocatoria_confirmed',
        'played',
      ]) {
        conn
          .prepare('UPDATE games SET status = ? WHERE id = ?')
          .run(status, gameId);
      }
      conn
        .prepare(
          `UPDATE games SET status = 'cancelled', cancelled_from = 'played' WHERE id = ?`
        )
        .run(gameId);
    });

    it('refuses an unknown state', () => {
      expect(() =>
        conn
          .prepare(`UPDATE games SET status = 'scheduled' WHERE id = ?`)
          .run(gameId)
      ).toThrow(/CHECK/);
    });

    it('refuses cancelled without cancelled_from', () => {
      expect(() =>
        conn
          .prepare(`UPDATE games SET status = 'cancelled' WHERE id = ?`)
          .run(gameId)
      ).toThrow(/CHECK/);
    });

    it('refuses cancelled_from on a game that is not cancelled', () => {
      expect(() =>
        conn
          .prepare(`UPDATE games SET cancelled_from = 'open' WHERE id = ?`)
          .run(gameId)
      ).toThrow(/CHECK/);
    });

    it('refuses cancelled_from naming cancelled', () => {
      expect(() =>
        conn
          .prepare(
            `UPDATE games SET status = 'cancelled', cancelled_from = 'cancelled' WHERE id = ?`
          )
          .run(gameId)
      ).toThrow(/CHECK/);
    });
  });

  describe.each(['share_debts', 'payments'] as const)('%s', table => {
    const columns = table === 'payments' ? ', payer_player_id, paid_on' : '';
    const values = table === 'payments' ? ", ?, '2025-09-11'" : '';
    const insert = (
      beneficiary: number | null,
      ordinal: number | null,
      amount = 400,
      holder = ana
    ) =>
      conn
        .prepare(
          `INSERT INTO ${table}
             (game_id, holder_player_id, beneficiary_player_id, guest_ordinal, amount_cents${columns})
           VALUES (?, ?, ?, ?, ?${values})`
        )
        .run(
          ...[gameId, holder, beneficiary, ordinal, amount],
          ...(table === 'payments' ? [holder] : [])
        );

    it('stores a share for a player and for an anonymous plus-one', () => {
      insert(beto, null);
      insert(null, 1);
    });

    it('refuses a row with both a beneficiary and a guest ordinal', () => {
      expect(() => insert(beto, 1)).toThrow(/CHECK/);
    });

    it('refuses a row with neither', () => {
      expect(() => insert(null, null)).toThrow(/CHECK/);
    });

    it('refuses a share that already exists', () => {
      insert(beto, null);
      expect(() => insert(beto, null)).toThrow(/UNIQUE/);
      insert(null, 1);
      expect(() => insert(null, 1)).toThrow(/UNIQUE/);
    });

    it('refuses a zero or negative amount', () => {
      expect(() => insert(beto, null, 0)).toThrow(/CHECK/);
      expect(() => insert(beto, null, -400)).toThrow(/CHECK/);
    });

    it('refuses a guest ordinal below one', () => {
      expect(() => insert(null, 0)).toThrow(/CHECK/);
    });
  });

  describe('share_debts query plans', () => {
    const plan = (where: string) =>
      (
        conn
          .prepare(
            `EXPLAIN QUERY PLAN SELECT * FROM share_debts WHERE ${where} = 1`
          )
          .all() as Array<{ detail: string }>
      )
        .map(r => r.detail)
        .join('\n');

    it('reads by game through idx_share_debts_game, not a scan', () => {
      expect(plan('game_id')).toMatch(/USING INDEX \w*idx_share_debts_game/);
    });

    it('reads by holder through idx_share_debts_holder, not a scan', () => {
      expect(plan('holder_player_id')).toMatch(
        /USING INDEX idx_share_debts_holder/
      );
    });
  });

  describe('convocatoria_entries', () => {
    let convocatoria: number;
    const entry = (
      player: number | null,
      host: number | null,
      ordinal: number | null
    ) =>
      conn
        .prepare(
          `INSERT INTO convocatoria_entries
             (convocatoria_id, player_id, guest_host_player_id, guest_ordinal,
              position, points, outcome, playing)
           VALUES (?, ?, ?, ?, 1, 1.5, 'called_up', 1)`
        )
        .run(convocatoria, player, host, ordinal);

    beforeEach(() => {
      convocatoria = run(
        `INSERT INTO convocatorias (game_id, rules_json) VALUES (?, '{}')`,
        gameId
      );
    });

    it('stores a player and an anonymous plus-one as entries', () => {
      entry(ana, null, null);
      entry(null, ana, 1);
    });

    it('refuses an entry that is both or neither', () => {
      expect(() => entry(ana, ana, 1)).toThrow(/CHECK/);
      expect(() => entry(null, null, null)).toThrow(/CHECK/);
    });

    it('refuses a guest ordinal without its host', () => {
      expect(() => entry(null, null, 1)).toThrow(/CHECK/);
    });

    it('refuses the same player or the same plus-one twice', () => {
      entry(ana, null, null);
      expect(() => entry(ana, null, null)).toThrow(/UNIQUE/);
      entry(null, ana, 1);
      expect(() => entry(null, ana, 1)).toThrow(/UNIQUE/);
    });

    it('a convocatoria starts unconfirmed and generated', () => {
      expect(
        conn
          .prepare(
            'SELECT confirmed_at, source FROM convocatorias WHERE id = ?'
          )
          .get(convocatoria)
      ).toEqual({ confirmed_at: null, source: 'generated' });
    });

    it('refuses an unknown convocatoria source', () => {
      expect(() =>
        conn
          .prepare(`UPDATE convocatorias SET source = 'guessed' WHERE id = ?`)
          .run(convocatoria)
      ).toThrow(/CHECK/);
    });
  });
});
