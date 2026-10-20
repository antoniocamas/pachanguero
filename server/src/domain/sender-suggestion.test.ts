import { describe, expect, it } from 'vitest';
import { SenderSuggestion } from './sender-suggestion.js';

describe('SenderSuggestion', () => {
  const players = (...names: string[]) =>
    names.map((name, index) => ({ id: index + 1, name }));
  const suggestedNames = (
    sender: string | null,
    names: string[],
    aliases: { playerId: number; alias: string }[] = []
  ) => {
    const all = players(...names);
    return new SenderSuggestion(all, aliases)
      .suggest(sender)
      .map(id => all.find(p => p.id === id)!.name);
  };

  it.each([
    ['Marta G.L.', ['Marta', 'Luis Pérez'], ['Marta']],
    ['Alberto H.M.', ['Alberto', 'Alberto H.'], ['Alberto', 'Alberto H.']],
    ['Álvaro B.X.', ['Álvaro B.', 'Álvaro C.'], ['Álvaro B.']],
    ['Marta G.L.', ['Marta García Pérez'], []],
    ['Jorge G.A.', ['Guti'], []],
    ['+34611111111', ['Marta', 'Luis Pérez'], []],
  ])('%s among %j is %j', (sender, names, expected) => {
    expect(suggestedNames(sender, names)).toEqual(expected);
  });

  it('reads the initials with or without a space', () => {
    expect(suggestedNames('Marta G. L.', ['Marta García Lopez'])).toEqual([
      'Marta García Lopez',
    ]);
    expect(suggestedNames('Marta G.L.', ['Marta García Lopez'])).toEqual([
      'Marta García Lopez',
    ]);
  });

  it('ignores accents on the first name', () => {
    expect(suggestedNames('Alvaro B.X.', ['Álvaro B.'])).toEqual(['Álvaro B.']);
  });

  it('suggests through a sign-up alias', () => {
    expect(
      suggestedNames(
        'Jorge G.A.',
        ['Guti'],
        [{ playerId: 1, alias: 'Jorge G.' }]
      )
    ).toEqual(['Guti']);
  });

  it('suggests a player once even when two of their names fit', () => {
    const all = [
      { id: 7, name: 'Marta Z.' },
      { id: 3, name: 'Marta' },
    ];
    const suggestion = new SenderSuggestion(all, [
      { playerId: 3, alias: 'Marta G.' },
    ]);
    expect(suggestion.suggest('Marta G.L.')).toEqual([3]);
  });

  it('orders the suggestions by name', () => {
    const all = [
      { id: 7, name: 'Marta' },
      { id: 3, name: 'Marta G.' },
    ];
    expect(new SenderSuggestion(all, []).suggest('Marta G.L.')).toEqual([7, 3]);
  });

  it('suggests nobody for a sender with no name', () => {
    expect(suggestedNames(null, ['Marta'])).toEqual([]);
  });
});
