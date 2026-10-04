import type Database from 'better-sqlite3';
import type { WeeklyScheduleRow } from '../domain/schedule-resolver.js';

export interface ScheduleRow extends WeeklyScheduleRow {
  id: number;
}

/**
 * Versioned, create-only: a schedule change is a new row with a later
 * `effective_from`. There is deliberately no update or delete.
 */
export class ScheduleRepository {
  constructor(private readonly conn: Database.Database) {}

  list(): ScheduleRow[] {
    return this.conn
      .prepare(
        'SELECT id, weekday, kickoff_time, effective_from FROM weekly_schedule ORDER BY effective_from'
      )
      .all() as ScheduleRow[];
  }

  create(row: WeeklyScheduleRow): ScheduleRow {
    const info = this.conn
      .prepare(
        'INSERT INTO weekly_schedule (weekday, kickoff_time, effective_from) VALUES (?, ?, ?)'
      )
      .run(row.weekday, row.kickoff_time, row.effective_from);
    return {
      id: Number(info.lastInsertRowid),
      weekday: row.weekday,
      kickoff_time: row.kickoff_time,
      effective_from: row.effective_from,
    };
  }
}
