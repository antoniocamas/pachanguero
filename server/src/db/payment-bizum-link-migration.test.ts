import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { PaymentBizumLinkMigration } from './payment-bizum-link-migration.js';

describe('PaymentBizumLinkMigration', () => {
  let conn: Database.Database;
  const columns = () =>
    (conn.pragma('table_info(payments)') as { name: string }[]).map(
      c => c.name
    );

  beforeEach(() => {
    conn = new Database(':memory:');
    conn.exec(`
      CREATE TABLE bizums (id INTEGER PRIMARY KEY);
      CREATE TABLE payments (
        id INTEGER PRIMARY KEY,
        amount_cents INTEGER NOT NULL,
        paid_on TEXT NOT NULL
      );
      INSERT INTO payments (amount_cents, paid_on) VALUES (400, '2026-10-07'), (400, '2026-10-08');
    `);
  });

  it('adds the column last, and every existing payment links to no Bizum', () => {
    new PaymentBizumLinkMigration().apply(conn);

    expect(columns().at(-1)).toBe('bizum_id');
    expect(conn.prepare('SELECT bizum_id FROM payments').all()).toEqual([
      { bizum_id: null },
      { bizum_id: null },
    ]);
  });

  it('adds no index', () => {
    new PaymentBizumLinkMigration().apply(conn);

    expect(conn.pragma('index_list(payments)')).toEqual([]);
  });

  it('does nothing the second time', () => {
    const step = new PaymentBizumLinkMigration();
    step.apply(conn);
    expect(() => step.apply(conn)).not.toThrow();
    expect(columns().filter(c => c === 'bizum_id')).toHaveLength(1);
  });

  it('is the step that makes the version 5', () => {
    expect(new PaymentBizumLinkMigration().version).toBe(5);
  });
});
