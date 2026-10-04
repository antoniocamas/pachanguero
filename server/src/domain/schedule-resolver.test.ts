import { describe, expect, it } from 'vitest';
import { ScheduleResolver } from './schedule-resolver.js';

const monday = {
  weekday: 1,
  kickoff_time: '22:00',
  effective_from: '2026-01-05',
};
const wednesday = {
  weekday: 3,
  kickoff_time: '21:00',
  effective_from: '2026-03-02',
};

describe('ScheduleResolver', () => {
  describe('nextOccurrenceOnOrAfter', () => {
    const resolver = new ScheduleResolver([monday]);

    it('rolls a Tuesday paste forward to the next Monday', () => {
      expect(resolver.nextOccurrenceOnOrAfter('2026-01-06')).toBe('2026-01-12');
    });

    it('keeps the day itself when it already is the game day', () => {
      expect(resolver.nextOccurrenceOnOrAfter('2026-01-05')).toBe('2026-01-05');
    });

    it('crosses a month boundary', () => {
      expect(resolver.nextOccurrenceOnOrAfter('2026-01-27')).toBe('2026-02-02');
    });
  });

  describe('a mid-season schedule change', () => {
    const resolver = new ScheduleResolver([wednesday, monday]);

    it('keeps resolving earlier dates against the old row', () => {
      expect(resolver.nextOccurrenceOnOrAfter('2026-02-20')).toBe('2026-02-23');
      expect(resolver.cutoffFor('2026-02-23')).toBe('2026-02-23T23:00');
    });

    it('resolves dates from the change onwards against the new row', () => {
      expect(resolver.nextOccurrenceOnOrAfter('2026-03-04')).toBe('2026-03-04');
      expect(resolver.nextOccurrenceOnOrAfter('2026-03-05')).toBe('2026-03-11');
      expect(resolver.cutoffFor('2026-03-04')).toBe('2026-03-04T22:00');
    });
  });

  it('rolls the cutoff into the next day for a late kickoff', () => {
    const late = new ScheduleResolver([
      { weekday: 1, kickoff_time: '23:30', effective_from: '2026-01-05' },
    ]);
    expect(late.cutoffFor('2026-01-05')).toBe('2026-01-06T00:30');
  });

  it('refuses a date before any schedule exists', () => {
    expect(() =>
      new ScheduleResolver([monday]).nextOccurrenceOnOrAfter('2025-12-31')
    ).toThrow(/No weekly schedule/);
  });
});
