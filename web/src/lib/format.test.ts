import { describe, expect, it } from 'vitest';
import { fmtPoints } from './format';

describe('fmtPoints', () => {
  it.each([
    [8.1, '8,1'],
    [9, '9'],
    [4.789, '4,79'],
    [0, '0'],
  ])('writes %f as %s', (points, text) => {
    expect(fmtPoints(points)).toBe(text);
  });
});
