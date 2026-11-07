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

    it('drops the Reservas heading and keeps the names beneath it', () => {
      const lines = parser.parseAll('1 Ana\n2 Beto\nReservas:\nCris\nDani');
      expect(lines.map(l => [l.position, 'name' in l ? l.name : null])).toEqual(
        [
          [1, 'Ana'],
          [2, 'Beto'],
          [3, 'Cris'],
          [4, 'Dani'],
        ]
      );
    });

    it('recognises the heading with decoration and any case', () => {
      expect(parser.parseAll('1 Ana\n📋 RESERVAS\n2 Beto')).toHaveLength(2);
    });

    it("drops the game's header, a line with a date or a time", () => {
      expect(
        parser.texts(
          'Lunes, 26/10 22:00, Samaranch.\n\n1. Ana\nMiércoles 21:30\n2. Beto'
        )
      ).toEqual(['Ana', 'Beto']);
    });

    it('reads a WhatsApp list with a header and reservas', () => {
      const paste = [
        'Lunes, 26/10 22:00, Samaranch.',
        '',
        '1. David',
        '5. \u2060Nacho',
        '7. Álvaro C',
        '8. \u2060Victor ',
        '9. \u2060Facu',
        '',
        'Reservas:',
        'Javi (Caro)',
        'Adrián (Facu )',
      ].join('\n');
      expect(parser.parseAll(paste)).toEqual([
        { position: 1, kind: 'plain', name: 'David' },
        { position: 2, kind: 'plain', name: 'Nacho' },
        { position: 3, kind: 'plain', name: 'Álvaro C' },
        { position: 4, kind: 'plain', name: 'Victor' },
        { position: 5, kind: 'plain', name: 'Facu' },
        { position: 6, kind: 'hostAnnotated', name: 'Javi', hostName: 'Caro' },
        {
          position: 7,
          kind: 'hostAnnotated',
          name: 'Adrián',
          hostName: 'Facu',
        },
      ]);
    });

    it('drops a separator and the heading above it, whatever it says', () => {
      const lines = parser.parseAll(
        'Equipo Rojo\n------------\nTri\nAlberto\n\n🔵 Los Otros\n_____\nNacho'
      );
      expect(lines.map(l => [l.position, 'name' in l ? l.name : null])).toEqual(
        [
          [1, 'Tri'],
          [2, 'Alberto'],
          [3, 'Nacho'],
        ]
      );
    });

    it('finds the heading above a blank line before the separator', () => {
      expect(parser.parseAll('Claros\n\n=====\nTri')).toHaveLength(1);
    });

    it('needs five repeats of one symbol to be a separator', () => {
      expect(parser.parseAll('Ana\n----\nBeto')).toHaveLength(3);
      expect(parser.parseAll('Ana\n-=-=-=\nBeto')).toHaveLength(3);
    });

    it('keeps a name that merely starts like the heading', () => {
      expect(parser.parseAll('1 Reservado')).toHaveLength(1);
    });
  });

  describe('texts', () => {
    it('gives each candidate line cleaned of decoration and headings', () => {
      expect(
        parser.texts(
          'Claros\n-----\n1. Ana ⚽\n2. Tave +1\n3. Adri (David)\n\nReservas\n4. Beto'
        )
      ).toEqual(['Ana', 'Tave +1', 'Adri (David)', 'Beto']);
    });

    it('feeds back into parse without changing the line', () => {
      const [text] = parser.texts('1. Adri (David)');
      expect(parser.parse(text, 1)).toEqual(parser.parseAll('Adri (David)')[0]);
    });
  });
});
