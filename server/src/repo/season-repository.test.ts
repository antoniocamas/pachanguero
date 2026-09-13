import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { SeasonRepository } from './season-repository.js';

describe('SeasonRepository', () => {
  let conn: Database.Database;
  let repo: SeasonRepository;

  beforeEach(() => {
    conn = TestDatabase.create();
    repo = new SeasonRepository(conn);
  });

  it('creates a season with defaults', () => {
    const season = repo.create({ name: '2025/2026' });
    expect(season.name).toBe('2025/2026');
    expect(season.price_cents).toBe(5600);
    expect(season.slots).toBe(14);
    expect(season.is_active).toBe(0);
  });

  it('gets and lists by name descending', () => {
    repo.create({ name: '2023/2024' });
    repo.create({ name: '2024/2025' });
    const names = repo.list().map(s => s.name);
    expect(names).toEqual(['2024/2025', '2023/2024']);
  });

  it('updates only the allowed columns', () => {
    const season = repo.create({ name: '2025/2026' });
    const updated = repo.update(season.id, { slots: 16, not_a_column: 'x' });
    expect(updated?.slots).toBe(16);
  });

  it('activates a season, deactivating every other one', () => {
    const a = repo.create({ name: 'A' });
    const b = repo.create({ name: 'B' });
    repo.activate(a.id);
    repo.activate(b.id);
    expect(repo.get(a.id)?.is_active).toBe(0);
    expect(repo.get(b.id)?.is_active).toBe(1);
    expect(repo.active()?.id).toBe(b.id);
  });

  it('maps a season row to SeasonRules', () => {
    const season = repo.create({
      name: '2025/2026',
      slots: 12,
      mercy_seats: 2,
    });
    const rules = repo.rulesOf(season);
    expect(rules).toMatchObject({
      slots: 12,
      mercySeats: 2,
      demotionDirection: 'bottom-up',
    });
  });
});
