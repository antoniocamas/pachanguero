import { describe, expect, it } from 'vitest';
import { bankCodeIn, withoutBankCode } from './bankReturn';

describe('bankCodeIn', () => {
  it('reads the code the server left', () => {
    expect(bankCodeIn('?bank=already_used')).toBe('already_used');
  });

  it('ignores an address with no code or with something that is not one', () => {
    expect(bankCodeIn('')).toBeNull();
    expect(bankCodeIn('?other=1')).toBeNull();
    expect(bankCodeIn('?bank=<script>')).toBeNull();
  });
});

describe('withoutBankCode', () => {
  it('keeps everything of the address but the code', () => {
    expect(
      withoutBankCode(new URL('http://x.test/a?bank=connected&b=1#h'))
    ).toBe('/a?b=1#h');
    expect(withoutBankCode(new URL('http://x.test/?bank=connected'))).toBe('/');
  });
});
