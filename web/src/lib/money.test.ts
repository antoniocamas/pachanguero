import { describe, expect, it } from 'vitest';
import { euros, parseEuros, shareCents } from './money';

describe('euros', () => {
  it.each([
    [400, '4 €'],
    [350, '3,5 €'],
    [375, '3,75 €'],
    [5, '0,05 €'],
    [0, '0 €'],
    [4400, '44 €'],
  ])('shows %i cents as %s', (cents, text) => {
    expect(euros(cents)).toBe(text);
  });
});

describe('parseEuros', () => {
  it.each([
    ['4', 400],
    ['4 €', 400],
    ['3,5', 350],
    ['3,75', 375],
    ['3.75', 375],
    [' 12 ', 1200],
    ['0,05', 5],
  ])('reads %j as %i cents', (text, cents) => {
    expect(parseEuros(text)).toBe(cents);
  });

  it.each(['', 'abc', '3,756', '-4', '0', '4,', '4 euros'])(
    'rejects %j',
    text => {
      expect(parseEuros(text)).toBeNull();
    }
  );

  it('round-trips what euros writes', () => {
    for (const cents of [400, 350, 375, 5, 1999])
      expect(parseEuros(euros(cents))).toBe(cents);
  });
});

describe('shareCents', () => {
  it('splits the price over the slots, rounded', () => {
    expect(shareCents(5600, 14)).toBe(400);
    expect(shareCents(1000, 3)).toBe(333);
  });
});
