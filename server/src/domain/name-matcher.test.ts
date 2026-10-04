import { describe, expect, it } from 'vitest';
import { NameMatcher } from './name-matcher.js';

const JORGE = 1;
const ALVARO = 2;
const PABLO = 3;
const FACU = 4;
const JUANITO = 5;
const MARTA = 6;

const players = [
  { id: JORGE, name: 'Jorge Gutiérrez' },
  { id: ALVARO, name: 'Álvaro R' },
  { id: PABLO, name: 'Pablo' },
  { id: FACU, name: 'Facu' },
  { id: JUANITO, name: 'Juanito' },
  { id: MARTA, name: 'Marta' },
];
const aliases = [
  { playerId: JORGE, alias: 'Guti' },
  { playerId: JORGE, alias: 'Gutito' },
  { playerId: JORGE, alias: 'Jorge' },
  { playerId: MARTA, alias: 'Juanito' },
];

describe('NameMatcher', () => {
  const matcher = new NameMatcher(players, aliases);

  describe('strip', () => {
    it.each([
      ['5 Álvaro R ⚽', 'Álvaro R'],
      ['• Pablo', 'Pablo'],
      ['  Facu   ', 'Facu'],
      ['12) Pablo', 'Pablo'],
      ['3.  Álvaro    R', 'Álvaro R'],
      ['- Facu', 'Facu'],
    ])('%j -> %j', (raw, expected) => {
      expect(matcher.strip(raw)).toBe(expected);
    });
  });

  describe('match', () => {
    it('matches a canonical name', () => {
      expect(matcher.match('Jorge Gutiérrez')).toEqual({
        outcome: 'matched',
        playerId: JORGE,
      });
    });

    it.each(['Guti', 'Gutito', 'Jorge'])('matches the alias %s', alias => {
      expect(matcher.match(alias)).toEqual({
        outcome: 'matched',
        playerId: JORGE,
      });
    });

    it('composes decoration stripping with alias matching', () => {
      expect(matcher.match('5 Guti ⚽')).toEqual({
        outcome: 'matched',
        playerId: JORGE,
      });
    });

    it('ignores case and accents', () => {
      expect(matcher.match('alvaro r')).toEqual({
        outcome: 'matched',
        playerId: ALVARO,
      });
    });

    it('reports a name shared by a canonical name and another alias as ambiguous', () => {
      expect(matcher.match('Juanito')).toEqual({
        outcome: 'ambiguous',
        playerIds: [JUANITO, MARTA],
      });
    });

    it('counts a player once when their alias equals their own name', () => {
      const m = new NameMatcher(players, [{ playerId: PABLO, alias: 'Pablo' }]);
      expect(m.match('Pablo')).toEqual({ outcome: 'matched', playerId: PABLO });
    });

    it('reports an unknown name as unresolved', () => {
      expect(matcher.match('7 Desconocido ⚽')).toEqual({
        outcome: 'unresolved',
      });
    });
  });

  describe('a WhatsApp-style paste, line by line', () => {
    const paste = [
      '1 Álvaro R ⚽',
      '2. Pablo',
      '• Facu',
      '  Guti  ',
      '5) Gutito ⚽',
      '6 Marta',
      '7 Nuevo Fichaje',
      '8 Juanito',
    ];

    it('splits into matched, ambiguous and unresolved', () => {
      expect(paste.map(line => matcher.match(line).outcome)).toEqual([
        'matched',
        'matched',
        'matched',
        'matched',
        'matched',
        'matched',
        'unresolved',
        'ambiguous',
      ]);
    });
  });
});
