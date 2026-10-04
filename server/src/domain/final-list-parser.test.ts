import { describe, expect, it } from 'vitest';
import { FinalListParser } from './final-list-parser.js';
import { NameStripper } from './name-stripper.js';

describe('FinalListParser', () => {
  const parser = new FinalListParser(new NameStripper());
  const players = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => `Player ${from + i}`);

  const paste = (first: 'Claros' | 'Oscuros', separator: string) => {
    const second = first === 'Claros' ? 'Oscuros' : 'Claros';
    return [
      first,
      separator,
      ...players(1, 7),
      '',
      second,
      separator,
      ...players(8, 14),
    ].join('\n');
  };

  it("splits the organiser's example, Claros first", () => {
    const lines = parser.splitByTeam(paste('Claros', '-------'));
    expect(lines).toHaveLength(14);
    expect(lines.slice(0, 7).every(l => l.team === 'claros')).toBe(true);
    expect(lines.slice(7).every(l => l.team === 'oscuros')).toBe(true);
    expect(lines.map(l => l.position)).toEqual(
      Array.from({ length: 14 }, (_, i) => i + 1)
    );
    expect(lines[0].line).toBe('Player 1');
  });

  it('accepts the headings in the other order', () => {
    const lines = parser.splitByTeam(paste('Oscuros', '-------'));
    expect(lines.slice(0, 7).every(l => l.team === 'oscuros')).toBe(true);
    expect(lines.slice(7).every(l => l.team === 'claros')).toBe(true);
  });

  it.each(['-------', '=====', '~~~', '..', '* * *', '———'])(
    'ignores the separator %j without numbering it',
    separator => {
      const lines = parser.splitByTeam(paste('Claros', separator));
      expect(lines).toHaveLength(14);
      expect(lines[0].position).toBe(1);
    }
  );

  it('recognises headings in any case and with decoration', () => {
    const lines = parser.splitByTeam('⚪ CLAROS\nAna\n⚫ oscuros\nBeto');
    expect(lines.map(l => [l.team, l.line])).toEqual([
      ['claros', 'Ana'],
      ['oscuros', 'Beto'],
    ]);
  });

  it('keeps list markers out of the line', () => {
    expect(parser.splitByTeam('Claros\n1. Ana ⚽')[0].line).toBe('Ana');
  });

  it('refuses a player line before any heading, naming it', () => {
    expect(() => parser.splitByTeam('Ana\nClaros\nBeto')).toThrow(/Ana/);
  });

  it('returns nothing for text with no players', () => {
    expect(parser.splitByTeam('Claros\n-----\nOscuros\n-----')).toEqual([]);
  });
});
