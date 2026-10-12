import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { ViewAsMigration } from './view-as-migration.js';

describe('ViewAsMigration', () => {
  let conn: Database.Database;
  const columns = () =>
    (conn.pragma('table_info(refresh_tokens)') as { name: string }[]).map(
      c => c.name
    );

  beforeEach(() => {
    conn = new Database(':memory:');
    conn.pragma('foreign_keys = ON');
    conn.exec(`
      CREATE TABLE players (id INTEGER PRIMARY KEY);
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE refresh_tokens (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL UNIQUE,
        view TEXT NOT NULL DEFAULT 'admin',
        expires_at TEXT NOT NULL
      );
      INSERT INTO users (id) VALUES (1);
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (1, 'h', '2027-01-01');
    `);
  });

  it('adds the column to a sessions table that lacks it, keeping its rows with no player', () => {
    new ViewAsMigration().apply(conn);

    expect(columns()).toContain('acting_as');
    expect(
      conn.prepare('SELECT token_hash, acting_as FROM refresh_tokens').all()
    ).toEqual([{ token_hash: 'h', acting_as: null }]);
  });

  it('does nothing to a table that already has it', () => {
    const step = new ViewAsMigration();
    step.apply(conn);
    expect(() => step.apply(conn)).not.toThrow();
  });
});
