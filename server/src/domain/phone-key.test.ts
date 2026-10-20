import { describe, expect, it } from 'vitest';
import { PhoneKey } from './phone-key.js';

describe('PhoneKey', () => {
  it.each([
    '611 11 11 11',
    '611111111',
    '0034611111111',
    '+34611111111',
    '+34 611-111.111',
  ])('%s is +34611111111', typed => {
    expect(new PhoneKey(typed).toString()).toBe('+34611111111');
  });

  it('keeps a foreign number as its prefix says', () => {
    expect(new PhoneKey('+44 7700 900123').toString()).toBe('+447700900123');
  });

  it('does not add +34 to a number of another length', () => {
    expect(new PhoneKey('7700900123').toString()).toBe('7700900123');
  });

  it('is the same as another typed differently', () => {
    expect(
      new PhoneKey('611 11 11 11').sameAs(new PhoneKey('+34611111111'))
    ).toBe(true);
    expect(new PhoneKey('611111111').sameAs(new PhoneKey('611111112'))).toBe(
      false
    );
  });
});
