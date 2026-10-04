import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { TestDatabase } from '../db/test-support.js';
import { ScheduleRepository } from './schedule-repository.js';

describe('ScheduleRepository', () => {
  let conn: Database.Database;
  let schedule: ScheduleRepository;

  beforeEach(() => {
    conn = TestDatabase.create();
    schedule = new ScheduleRepository(conn);
  });

  it('round-trips created rows, oldest first', () => {
    schedule.create({
      weekday: 3,
      kickoff_time: '21:00',
      effective_from: '2026-03-02',
    });
    const first = schedule.create({
      weekday: 1,
      kickoff_time: '22:00',
      effective_from: '2026-01-05',
    });
    expect(first.id).toBeGreaterThan(0);
    expect(schedule.list().map(r => r.effective_from)).toEqual([
      '2026-01-05',
      '2026-03-02',
    ]);
    expect(schedule.list()[0]).toMatchObject({
      weekday: 1,
      kickoff_time: '22:00',
    });
  });

  it('refuses two rows effective from the same date', () => {
    schedule.create({
      weekday: 1,
      kickoff_time: '22:00',
      effective_from: '2026-01-05',
    });
    expect(() =>
      schedule.create({
        weekday: 2,
        kickoff_time: '20:00',
        effective_from: '2026-01-05',
      })
    ).toThrow();
  });

  it('offers no way to change or remove an existing row', () => {
    // @ts-expect-error update does not exist
    expect(schedule.update).toBeUndefined();
    // @ts-expect-error delete does not exist
    expect(schedule.delete).toBeUndefined();
  });
});
