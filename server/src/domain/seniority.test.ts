import { describe, expect, it } from 'vitest';
import { SeniorityCurve } from './seniority.js';

describe('SeniorityCurve', () => {
  const curve = new SeniorityCurve();

  // The Aux tab of the 2024/2025 sheet, to its full precision.
  const aux: Array<[number, number]> = [
    [1, 1],
    [2, 1.79248125],
    [3, 2.475087445],
    [4, 3.088234638],
    [5, 3.652809672],
    [6, 4.181130505],
    [7, 4.681130505],
    [8, 5.15825176],
    [9, 5.61640867],
    [10, 6.058522779],
    [11, 6.48684012],
    [12, 6.903129784],
    [13, 7.308813655],
  ];

  it.each(aux)('season %i matches the Aux table', (seasons, expected) => {
    expect(curve.total(seasons)).toBeCloseTo(expected, 8);
  });

  it('is zero below one season and extends past the table', () => {
    expect(curve.total(0)).toBe(0);
    expect(curve.total(-3)).toBe(0);
    expect(curve.total(20)).toBeGreaterThan(curve.total(13));
  });

  it('has diminishing returns', () => {
    const steps = Array.from(
      { length: 12 },
      (_, i) => curve.total(i + 2) - curve.total(i + 1)
    );
    for (let i = 1; i < steps.length; i++)
      expect(steps[i]).toBeLessThan(steps[i - 1]);
  });
});
