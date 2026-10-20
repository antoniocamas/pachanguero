import { describe, expect, it } from 'vitest';
import { TextFolding } from './text-folding.js';

describe('TextFolding', () => {
  const folding = new TextFolding();

  it('folds case and accents', () => {
    expect(folding.fold('FÚTBOL Álvaro')).toBe('futbol alvaro');
  });

  it('tidies runs of spaces and the ends', () => {
    expect(folding.tidy('  Luis   P.R. ')).toBe('luis p.r.');
  });

  it.each([
    ['Luis P.R.', ' luis  p.r.'],
    ['Álvaro', 'alvaro'],
  ])('%s is the same as %s', (a, b) => {
    expect(folding.same(a, b)).toBe(true);
  });

  it('tells different texts apart', () => {
    expect(folding.same('Luis P.R.', 'Luis P.')).toBe(false);
  });
});
