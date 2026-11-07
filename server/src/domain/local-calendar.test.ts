import { describe, expect, it } from 'vitest';
import { LocalCalendar } from './local-calendar.js';

describe('LocalCalendar', () => {
  const calendar = new LocalCalendar();

  it('writes a date as YYYY-MM-DD in local time', () => {
    expect(calendar.dateOf(new Date(2026, 9, 11, 19, 30, 0))).toBe(
      '2026-10-11'
    );
  });
});
