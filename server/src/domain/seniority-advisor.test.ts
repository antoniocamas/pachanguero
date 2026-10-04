import { describe, expect, it } from 'vitest';
import { SeniorityAdvisor } from './seniority-advisor.js';

describe('SeniorityAdvisor', () => {
  const advisor = new SeniorityAdvisor();

  it('suggests 0 for a brand-new player', () => {
    expect(advisor.suggest(null)).toBe(0);
  });

  it('carries on from the last recorded value after a gap', () => {
    expect(advisor.suggest(3)).toBe(4);
  });

  it('adds one for a consecutive appearance', () => {
    expect(advisor.suggest(0)).toBe(1);
  });
});
