import { describe, expect, it } from 'vitest';
import { SeasonCalendar } from './season-calendar.js';

describe('SeasonCalendar', () => {
  it('bounds a season from 1 September to 31 August of the next year', () => {
    expect(new SeasonCalendar().boundsFor(2024)).toEqual({
      startsOn: '2024-09-01',
      endsOn: '2025-08-31',
    });
  });

  it.each([
    ['2026-09-01', '2026/2027'],
    ['2026-10-05', '2026/2027'],
    ['2027-08-31', '2026/2027'],
    ['2027-09-01', '2027/2028'],
    ['2027-01-15', '2026/2027'],
  ])('names the season %s falls in', (date, name) => {
    expect(new SeasonCalendar().nameFor(date)).toBe(name);
  });
});
