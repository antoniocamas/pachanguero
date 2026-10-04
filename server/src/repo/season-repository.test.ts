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

  it('derives Sept-Aug bounds from the name', () => {
    const season = repo.create({ name: '2024/2025' });
    expect(season.starts_on).toBe('2024-09-01');
    expect(season.ends_on).toBe('2025-08-31');
  });

  it('rejects a name that does not start with a 4-digit year', () => {
    expect(() => repo.create({ name: 'Temporada' })).toThrow(/4-digit year/);
  });

  it('recomputes both bounds together when the name changes', () => {
    const season = repo.create({ name: '2024/2025' });
    const updated = repo.update(season.id, { name: '2026/2027' });
    expect(updated?.starts_on).toBe('2026-09-01');
    expect(updated?.ends_on).toBe('2027-08-31');
  });

  it('refuses two seasons starting the same year', () => {
    repo.create({ name: '2024/2025' });
    expect(() => repo.create({ name: '2024/25' })).toThrow();
  });

  describe('current()', () => {
    beforeEach(() => {
      repo.create({ name: '2023/2024' });
      repo.create({ name: '2024/2025' });
      repo.create({ name: '2025/2026' });
    });

    it('resolves a date inside each of three adjoining seasons', () => {
      expect(repo.current('2023-10-15')?.name).toBe('2023/2024');
      expect(repo.current('2025-03-05')?.name).toBe('2024/2025');
      expect(repo.current('2025-12-31')?.name).toBe('2025/2026');
    });

    it('resolves the boundary days to the season they belong to', () => {
      expect(repo.current('2024-08-31')?.name).toBe('2023/2024');
      expect(repo.current('2024-09-01')?.name).toBe('2024/2025');
    });

    it('returns undefined for a date in a year with no season', () => {
      expect(repo.current('2022-11-02')).toBeUndefined();
      expect(repo.current('2027-01-01')).toBeUndefined();
    });
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
