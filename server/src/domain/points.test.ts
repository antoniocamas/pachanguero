import { describe, expect, it } from 'vitest';
import { PointsCalculator } from './points.js';

describe('PointsCalculator', () => {
  const calc = new PointsCalculator();

  // Rows straight off the Puntos tab: paid, exclusions, seasons -> total.
  const rows: Array<[string, number, number, number, number]> = [
    ['Antonio C', 30, 0, 13, 37.308813655],
    ['Fer', 30, 1, 2, 32.79248125],
    ['Nacho', 19, 3, 1, 23],
    ['Emma', 24, 4, 2, 29.79248125],
    ['Miguel', 34, 0, 13, 41.308813655],
    ['Pablo', 11, 7, 2, 19.79248125],
    ['Pablo Silvage', 4, 6, 1, 11],
    ['Dani', 6, 1, 7, 11.681130505],
    ['Adri', 4, 0, 0, 4],
  ];

  it.each(rows)('%s', (_name, paidGames, exclusions, seasons, total) => {
    expect(calc.compute({ paidGames, exclusions, seasons }).total).toBeCloseTo(
      total,
      8
    );
  });

  it('paying for guests still scores a single point', () => {
    // An 8 or a 16 in Pagos is one attendance, not two or four.
    expect(
      calc.compute({ paidGames: 1, exclusions: 0, seasons: 0 }).attendance
    ).toBe(1);
  });

  it('clamps negative inputs to zero', () => {
    const b = calc.compute({ paidGames: -3, exclusions: -1, seasons: 0 });
    expect(b.attendance).toBe(0);
    expect(b.exclusions).toBe(0);
  });
});
