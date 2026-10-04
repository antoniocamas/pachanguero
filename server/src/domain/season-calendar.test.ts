import { describe, expect, it } from 'vitest';
import { SeasonCalendar } from './season-calendar.js';

describe('SeasonCalendar', () => {
  it('bounds a season from 1 September to 31 August of the next year', () => {
    expect(new SeasonCalendar().boundsFor(2024)).toEqual({
      startsOn: '2024-09-01',
      endsOn: '2025-08-31',
    });
  });
});
