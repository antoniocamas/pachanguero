import { describe, expect, it } from 'vitest';
import { CandidateLineParser } from './candidate-line-parser.js';
import { NameStripper } from './name-stripper.js';

describe('CandidateLineParser', () => {
  const parser = new CandidateLineParser(new NameStripper());

  describe('parse', () => {
    it('reads a plain name, ignoring decoration', () => {
      expect(parser.parse('5 Álvaro R ⚽', 5)).toEqual({
        position: 5,
        kind: 'plain',
        name: 'Álvaro R',
      });
    });

    it('reads a name with its host', () => {
      expect(parser.parse('9. Adri (David)', 9)).toEqual({
        position: 9,
        kind: 'hostAnnotated',
        name: 'Adri',
        hostName: 'David',
      });
    });

    it('reads a plus-one as the host alone', () => {
      expect(parser.parse('12 Álvaro +1', 12)).toEqual({
        position: 12,
        kind: 'plusOne',
        hostName: 'Álvaro',
      });
      expect(parser.parse('Álvaro + 1 ⚽', 1)).toMatchObject({
        kind: 'plusOne',
        hostName: 'Álvaro',
      });
    });

    it('checks the plus-one before a parenthetical', () => {
      expect(parser.parse('Marta (Sub) +1', 1)).toEqual({
        position: 1,
        kind: 'plusOne',
        hostName: 'Marta (Sub)',
      });
    });

    it('tidies stray spaces around the name and host', () => {
      expect(parser.parse('3   Adri   (  David )', 3)).toMatchObject({
        name: 'Adri',
        hostName: 'David',
      });
    });
  });

  describe('parseAll', () => {
    it('numbers candidate lines from 1 and skips blank lines', () => {
      const lines = parser.parseAll('1 Ana\n\n2 Beto\r\n   \n3 Cris');
      expect(lines.map(l => [l.position, 'name' in l ? l.name : null])).toEqual(
        [
          [1, 'Ana'],
          [2, 'Beto'],
          [3, 'Cris'],
        ]
      );
    });

    it('drops the Reservas heading and everything after it', () => {
      const lines = parser.parseAll('1 Ana\n2 Beto\nReservas:\n3 Cris\n4 Dani');
      expect(lines).toHaveLength(2);
    });

    it('recognises the heading with decoration and any case', () => {
      expect(parser.parseAll('1 Ana\n📋 RESERVAS\n2 Beto')).toHaveLength(1);
    });

    it('keeps a name that merely starts like the heading', () => {
      expect(parser.parseAll('1 Reservado')).toHaveLength(1);
    });
  });
});
