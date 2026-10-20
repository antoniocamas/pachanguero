import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerBizumNameMigration } from './player-bizum-name-migration.js';

describe('PlayerBizumNameMigration', () => {
  let conn: Database.Database;
  const columns = () =>
    (conn.pragma('table_info(players)') as { name: string }[]).map(c => c.name);

  beforeEach(() => {
    conn = new Database(':memory:');
    conn.exec(`
      CREATE TABLE players (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      INSERT INTO players (name) VALUES ('Luis Pérez'), ('Marta García');
    `);
  });

  it('adds the column last, and every existing player reads null', () => {
    new PlayerBizumNameMigration().apply(conn);

    expect(columns().at(-1)).toBe('bizum_name');
    expect(
      conn.prepare('SELECT name, bizum_name FROM players ORDER BY id').all()
    ).toEqual([
      { name: 'Luis Pérez', bizum_name: null },
      { name: 'Marta García', bizum_name: null },
    ]);
  });

  it('does nothing the second time', () => {
    const step = new PlayerBizumNameMigration();
    step.apply(conn);
    expect(() => step.apply(conn)).not.toThrow();
    expect(columns().filter(c => c === 'bizum_name')).toHaveLength(1);
  });

  it('lets two players hold the same Bizum name', () => {
    new PlayerBizumNameMigration().apply(conn);
    expect(() =>
      conn.exec("UPDATE players SET bizum_name = 'Luis P.R.'")
    ).not.toThrow();
  });
});
