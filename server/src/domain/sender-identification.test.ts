import { describe, expect, it } from 'vitest';
import { SenderIdentification } from './sender-identification.js';
import { SenderSuggestion } from './sender-suggestion.js';

describe('SenderIdentification', () => {
  const luis = 1;
  const marta = 2;
  const martaGomez = 3;
  const names = [
    { id: luis, name: 'Luis Pérez' },
    { id: marta, name: 'Marta García' },
    { id: martaGomez, name: 'Marta Gómez' },
    { id: 4, name: 'Marta' },
  ];

  const identification = (
    bizumNames: { playerId: number; bizumName: string }[] = [],
    phones: { playerId: number; phone: string }[] = []
  ) =>
    new SenderIdentification(
      bizumNames,
      phones,
      new SenderSuggestion(names, [])
    );
  const name = (value: string) => ({ name: value, phone: null });
  const phone = (value: string) => ({ name: null, phone: value });

  it('recognises the player paired with a Bizum name', () => {
    const found = identification([
      { playerId: luis, bizumName: 'Luis P.R.' },
    ]).identify(name('Luis P.R.'));
    expect(found).toEqual({ kind: 'player', playerId: luis });
  });

  it('compares the Bizum name ignoring case, accents and extra spaces', () => {
    const found = identification([
      { playerId: luis, bizumName: 'Luís  p.r.' },
    ]).identify(name('LUIS P.R.'));
    expect(found).toEqual({ kind: 'player', playerId: luis });
  });

  it('recognises nobody from a name no player holds, and suggests', () => {
    const found = identification().identify(name('Marta G.L.'));
    expect(found).toEqual({
      kind: 'unknown',
      suggestions: [4, marta, martaGomez],
    });
  });

  it('never recognises a sender from a player name', () => {
    const found = identification().identify(name('Luis Pérez'));
    expect(found.kind).toBe('unknown');
  });

  it('recognises the player who has the phone', () => {
    const found = identification(
      [],
      [{ playerId: luis, phone: '+34600000000' }]
    ).identify(phone('+34600000000'));
    expect(found).toEqual({ kind: 'player', playerId: luis });
  });

  it.each(['611 11 11 11', '611111111', '0034611111111', '+34611111111'])(
    'recognises a phone stored as %s',
    stored => {
      const found = identification(
        [],
        [{ playerId: luis, phone: stored }]
      ).identify(phone('+34611111111'));
      expect(found).toEqual({ kind: 'player', playerId: luis });
    }
  );

  it('identifies nobody when two players have the same Bizum name', () => {
    const found = identification([
      { playerId: marta, bizumName: 'Marta G.L.' },
      { playerId: martaGomez, bizumName: 'Marta G.L.' },
    ]).identify(name('Marta G.L.'));
    expect(found).toEqual({
      kind: 'ambiguous',
      playerIds: [marta, martaGomez],
    });
  });

  it('identifies nobody when two players have the same phone', () => {
    const found = identification(
      [],
      [
        { playerId: marta, phone: '611111111' },
        { playerId: martaGomez, phone: '+34611111111' },
      ]
    ).identify(phone('+34611111111'));
    expect(found.kind).toBe('ambiguous');
  });

  it('is unknown, with no suggestion, for a phone nobody has', () => {
    expect(identification().identify(phone('+34611111111'))).toEqual({
      kind: 'unknown',
      suggestions: [],
    });
  });

  it('looks a phone sender up by phone only, never by a Bizum name', () => {
    const found = identification([
      { playerId: luis, bizumName: '+34611111111' },
    ]).identify(phone('+34611111111'));
    expect(found.kind).toBe('unknown');
  });

  it('falls to the name when the phone matches nobody', () => {
    const found = identification(
      [{ playerId: luis, bizumName: 'Luis P.R.' }],
      [{ playerId: marta, phone: '600000000' }]
    ).identify({ name: 'Luis P.R.', phone: '+34611111111' });
    expect(found).toEqual({ kind: 'player', playerId: luis });
  });
});
