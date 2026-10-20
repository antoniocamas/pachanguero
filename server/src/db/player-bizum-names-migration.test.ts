import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerBizumNamesMigration } from './player-bizum-names-migration.js';

describe('PlayerBizumNamesMigration', () => {
  let conn: Database.Database;
  const columns = () =>
    (conn.pragma('table_info(players)') as { name: string }[]).map(c => c.name);
  const names = () =>
    conn
      .prepare(
        'SELECT player_id, bizum_name FROM player_bizum_names ORDER BY player_id'
      )
      .all();

  beforeEach(() => {
    conn = new Database(':memory:');
    conn.pragma('foreign_keys = ON');
    conn.exec(`
      CREATE TABLE players (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, bizum_name TEXT);
      CREATE TABLE player_bizum_names (
        player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        bizum_name TEXT    NOT NULL,
        PRIMARY KEY (player_id, bizum_name)
      );
      INSERT INTO players (id, name, bizum_name)
        VALUES (1, 'Luis Pérez', 'Luis P.R.'), (2, 'Marta García', NULL), (3, 'Ana López', '  '), (4, 'Beto Ruiz', 'Beto R.');
    `);
  });

  it('moves each name into the new table and drops the column', () => {
    new PlayerBizumNamesMigration().apply(conn);

    expect(names()).toEqual([
      { player_id: 1, bizum_name: 'Luis P.R.' },
      { player_id: 4, bizum_name: 'Beto R.' },
    ]);
    expect(columns()).not.toContain('bizum_name');
    expect(conn.prepare('SELECT COUNT(*) AS n FROM players').get()).toEqual({
      n: 4,
    });
  });

  it('does nothing when the column is already gone, as in a file the current schema made', () => {
    const step = new PlayerBizumNamesMigration();
    step.apply(conn);

    expect(() => step.apply(conn)).not.toThrow();
    expect(names()).toHaveLength(2);
  });
});
