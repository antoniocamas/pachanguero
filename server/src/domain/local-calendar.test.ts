import { describe, expect, it } from 'vitest';
import { LocalCalendar } from './local-calendar.js';

describe('LocalCalendar', () => {
  const calendar = new LocalCalendar();

  it('writes a date as YYYY-MM-DD in local time', () => {
    expect(calendar.dateOf(new Date(2026, 9, 11, 19, 30, 0))).toBe(
      '2026-10-11'
    );
  });

  it('writes a moment as YYYYMMDD-HHMMSS in local time, padded', () => {
    expect(calendar.timestampOf(new Date(2026, 9, 11, 19, 30, 0))).toBe(
      '20261011-193000'
    );
    expect(calendar.timestampOf(new Date(2026, 0, 2, 3, 4, 5))).toBe(
      '20260102-030405'
    );
  });
});
