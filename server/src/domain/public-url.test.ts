import { describe, expect, it } from 'vitest';
import { PublicUrl } from './public-url.js';

describe('PublicUrl', () => {
  it.each([
    ['https://pachanguero.duckdns.org', 'https://pachanguero.duckdns.org'],
    ['https://pachanguero.duckdns.org/', 'https://pachanguero.duckdns.org'],
    ['  https://pachanguero.example.org  ', 'https://pachanguero.example.org'],
    [
      'https://pachanguero.example.org:8443',
      'https://pachanguero.example.org:8443',
    ],
    ['http://localhost:5173', 'http://localhost:5173'],
    ['http://localhost', 'http://localhost'],
    ['http://127.0.0.1:8787/', 'http://127.0.0.1:8787'],
  ])('accepts %s', (given, origin) => {
    const url = PublicUrl.of(given);
    expect(url.problems()).toEqual([]);
    expect(url.callbackUrl()).toBe(`${origin}/api/bank/callback`);
  });

  it.each([
    'http://pachanguero.example.org',
    'ftp://pachanguero.example.org',
    'pachanguero.example.org',
    'https://pachanguero.example.org/app',
    'https://pachanguero.example.org/?a=1',
    'https://pachanguero.example.org/?',
    'https://pachanguero.example.org#top',
    'https://user:secret@pachanguero.example.org',
    'http://localhost.evil.example.org',
    'javascript:alert(1)',
  ])('refuses %s as invalid', given => {
    expect(PublicUrl.of(given).problems()).toEqual(['public_url_invalid']);
  });

  it.each([undefined, '', '   '])('reports %j as missing', given => {
    expect(PublicUrl.of(given).problems()).toEqual(['public_url_missing']);
  });

  it('reads the environment', () => {
    expect(
      PublicUrl.fromEnv({
        PACHANGUERO_PUBLIC_URL: 'https://a.example.org',
      }).callbackUrl()
    ).toBe('https://a.example.org/api/bank/callback');
    expect(PublicUrl.fromEnv({}).problems()).toEqual(['public_url_missing']);
  });

  it('has no callback address when it has a problem', () => {
    expect(() => PublicUrl.of('nope').callbackUrl()).toThrow();
  });
});
