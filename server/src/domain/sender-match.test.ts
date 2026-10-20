import { describe, expect, it } from 'vitest';
import { SenderMatch } from './sender-match.js';

describe('SenderMatch', () => {
  const match = new SenderMatch();
  const named = (name: string | null) => ({ name, phone: null });
  const phoned = (phone: string | null) => ({ name: null, phone });

  it.each([
    ['Luis P.R.', 'luis p.r.', true],
    ['Luis P.R.', '  Luis   P.R. ', true],
    ['Álvaro B.X.', 'Alvaro B.X.', true],
    ['Luis P.R.', 'Luis P.S.', false],
  ])('names %s and %s: %s', (a, b, expected) => {
    expect(match.same(named(a), named(b))).toBe(expected);
  });

  it('compares phones as the group does, however they were typed', () => {
    expect(match.same(phoned('+34600000000'), phoned('+34 600 000 000'))).toBe(
      true
    );
    expect(match.same(phoned('+34600000000'), phoned('+34611111111'))).toBe(
      false
    );
  });

  it('never matches a phone sender to a name sender, nor a sender with nothing', () => {
    expect(match.same(phoned('+34600000000'), named('Luis P.R.'))).toBe(false);
    expect(match.same(named('Luis P.R.'), phoned('+34600000000'))).toBe(false);
    expect(match.same(named(null), named(null))).toBe(false);
  });
});
