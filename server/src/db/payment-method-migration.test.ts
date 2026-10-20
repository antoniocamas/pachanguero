import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { PaymentMethodMigration } from './payment-method-migration.js';

describe('PaymentMethodMigration', () => {
  let conn: Database.Database;
  const columns = () =>
    (conn.pragma('table_info(payments)') as { name: string }[]).map(
      c => c.name
    );

  beforeEach(() => {
    conn = new Database(':memory:');
    conn.exec(`
      CREATE TABLE payments (
        id INTEGER PRIMARY KEY,
        amount_cents INTEGER NOT NULL,
        paid_on TEXT NOT NULL
      );
      INSERT INTO payments (amount_cents, paid_on) VALUES (400, '2026-10-07'), (400, '2026-10-08');
    `);
  });

  it('adds the column, and every existing payment reads "otro"', () => {
    new PaymentMethodMigration().apply(conn);

    expect(columns()).toContain('method');
    expect(
      conn.prepare('SELECT amount_cents, paid_on, method FROM payments').all()
    ).toEqual([
      { amount_cents: 400, paid_on: '2026-10-07', method: 'otro' },
      { amount_cents: 400, paid_on: '2026-10-08', method: 'otro' },
    ]);
  });

  it('does nothing the second time', () => {
    const step = new PaymentMethodMigration();
    step.apply(conn);
    expect(() => step.apply(conn)).not.toThrow();
    expect(columns().filter(c => c === 'method')).toHaveLength(1);
  });

  it('refuses a method outside the list', () => {
    new PaymentMethodMigration().apply(conn);
    expect(() =>
      conn.exec(
        "INSERT INTO payments (amount_cents, paid_on, method) VALUES (400, '2026-10-09', 'cash')"
      )
    ).toThrow('CHECK constraint failed');
  });
});
