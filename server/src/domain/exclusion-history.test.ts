import { describe, expect, it } from 'vitest';
import { ExclusionHistory } from './exclusion-history.js';
import {
  DEFAULT_RULES,
  type ExclusionKind,
  type SeasonRules,
} from './types.js';

const rules = (over: Partial<SeasonRules> = {}): SeasonRules => ({
  ...DEFAULT_RULES,
  ...over,
});
const history = (...k: ExclusionKind[]) => new ExclusionHistory(k);

describe('ExclusionHistory.waitCounter', () => {
  const legacy = rules({ mercyResetsCounter: false });
  const stated = rules({ mercyResetsCounter: true });

  it('counts both exclusion kinds but never a mercy seat', () => {
    expect(history('points', 'demoted').waitCounter(legacy)).toBe(2);
  });

  it('reproduces the legacy remainder bug', () => {
    // Pablo Silvage: 1,1,1,D,1,1,1,D — carries +1 twice, ends eligible.
    const silvage = history(
      'points',
      'points',
      'points',
      'mercy',
      'points',
      'points',
      'points',
      'mercy'
    );
    expect(silvage.waitCounter(legacy)).toBe(2);
    expect(silvage.waitCounter(stated)).toBe(0);
  });

  it('agrees with the stated rule when the wait was exactly the threshold', () => {
    // Pablo: 1,1,D,1,1,D,1,1,2 — never waits more than 2, so both agree.
    const pablo = history(
      'points',
      'points',
      'mercy',
      'points',
      'points',
      'mercy',
      'points',
      'points',
      'demoted'
    );
    expect(pablo.waitCounter(legacy)).toBe(3);
    expect(pablo.waitCounter(stated)).toBe(3);
  });
});

describe('ExclusionHistory.mercyCount / demotionCount', () => {
  it('counts mercy seats received', () => {
    expect(history('mercy', 'points', 'mercy').mercyCount()).toBe(2);
  });

  it('counts demotions received', () => {
    expect(
      history('demoted', 'points', 'demoted', 'mercy').demotionCount()
    ).toBe(2);
  });

  it('is zero for an empty history', () => {
    expect(history().mercyCount()).toBe(0);
    expect(history().demotionCount()).toBe(0);
    expect(history().waitCounter(rules())).toBe(0);
    expect(history().exclusionCount()).toBe(0);
  });
});

describe('ExclusionHistory.exclusionCount', () => {
  it('counts every points/demoted entry, excluding mercy seats', () => {
    expect(
      history('points', 'demoted', 'mercy', 'points').exclusionCount()
    ).toBe(3);
  });
});
