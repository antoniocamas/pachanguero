export interface WeeklyScheduleRow {
  /** 0-6 as `Date.getDay()` reports it: Sunday = 0. */
  weekday: number;
  /** 'HH:MM' */
  kickoff_time: string;
  /** First date this row governs, 'YYYY-MM-DD'. */
  effective_from: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Works out game dates from a versioned weekly schedule. Every question is
 * answered with the row that was in force on the date asked about, never
 * today's, so a later schedule change cannot rewrite earlier weeks.
 */
export class ScheduleResolver {
  private readonly rows: WeeklyScheduleRow[];

  constructor(rows: readonly WeeklyScheduleRow[]) {
    this.rows = [...rows].sort((a, b) =>
      a.effective_from.localeCompare(b.effective_from)
    );
  }

  /** The first date on or after `asOf` that falls on the scheduled weekday. */
  nextOccurrenceOnOrAfter(asOf: string): string {
    const { weekday } = this.effectiveRow(asOf);
    const start = this.utc(asOf);
    const ahead = (weekday - new Date(start).getUTCDay() + 7) % 7;
    return this.isoDate(start + ahead * DAY_MS);
  }

  private effectiveRow(asOf: string): WeeklyScheduleRow {
    const row = this.rows.filter(r => r.effective_from <= asOf).at(-1);
    if (!row) throw new Error(`No weekly schedule in force on ${asOf}`);
    return row;
  }

  private utc(date: string): number {
    return Date.parse(`${date}T00:00:00Z`);
  }

  private isoDate(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
