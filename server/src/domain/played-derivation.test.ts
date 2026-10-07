import { describe, expect, it } from 'vitest';
import { PlayedDerivation } from './played-derivation.js';
import type { ExclusionKind, Outcome } from './types.js';

describe('PlayedDerivation', () => {
  const derive = (outcome: Outcome, playing: boolean) =>
    new PlayedDerivation().derive([{ playerId: 7, playing, outcome }]);

  it.each<[string, Outcome, boolean, boolean, ExclusionKind | null]>([
    ['chosen by the algorithm', 'called_up', true, true, null],
    ['left out by the algorithm', 'excluded', false, false, 'points'],
    [
      'demoted by the algorithm and still out',
      'demoted',
      false,
      false,
      'demoted',
    ],
    [
      'chosen by the algorithm and taken out by hand',
      'called_up',
      false,
      false,
      'points',
    ],
    [
      'left out by the algorithm and put in by hand',
      'excluded',
      true,
      true,
      null,
    ],
    [
      'demoted by the algorithm and put in by hand',
      'demoted',
      true,
      true,
      null,
    ],
    ['given the mercy seat', 'mercy', true, true, 'mercy'],
    [
      'given the mercy seat and taken out by hand',
      'mercy',
      false,
      false,
      'points',
    ],
  ])('%s', (_case, outcome, playing, played, exclusion) => {
    expect(derive(outcome, playing)).toEqual([
      { playerId: 7, played, exclusion },
    ]);
  });

  it('yields nothing for an anonymous plus-one', () => {
    expect(
      new PlayedDerivation().derive([
        { playerId: null, playing: true, outcome: 'called_up' },
      ])
    ).toEqual([]);
  });
});
