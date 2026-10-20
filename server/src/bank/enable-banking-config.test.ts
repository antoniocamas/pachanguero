import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EnableBankingConfig } from './enable-banking-config.js';

describe('EnableBankingConfig', () => {
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();

  it('has no problem with an id and a PKCS#8 key', () => {
    const config = EnableBankingConfig.of({ appId: 'app', privateKey: pem });
    expect(config.problems()).toEqual([]);
    expect(config.appId).toBe('app');
  });

  it('names what is missing, never the value', () => {
    expect(EnableBankingConfig.fromEnv({}).problems()).toEqual([
      'app_id_missing',
      'private_key_missing',
    ]);
    expect(EnableBankingConfig.of({ appId: 'app' }).problems()).toEqual([
      'private_key_missing',
    ]);
    expect(EnableBankingConfig.of({ privateKey: pem }).problems()).toEqual([
      'app_id_missing',
    ]);
  });

  it('accepts a key on one line with \\n for its line breaks', () => {
    const oneLine = pem.trim().replace(/\n/g, '\\n');
    expect(oneLine).not.toContain('\n');
    const config = EnableBankingConfig.of({
      appId: 'app',
      privateKey: oneLine,
    });
    expect(config.problems()).toEqual([]);
    expect(config.privateKey).toBe(pem.trim());
  });

  it.each([
    ['not a key at all', 'hello'],
    [
      'a certificate header',
      '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
    ],
    [
      'a broken PKCS#8 body',
      '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    ],
  ])('reports %s as invalid', (_name, key) => {
    expect(
      EnableBankingConfig.of({ appId: 'app', privateKey: key }).problems()
    ).toEqual(['private_key_invalid']);
  });

  it('refuses a PKCS#1 RSA key: it is not PKCS#8', () => {
    const pkcs1 = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs1', format: 'pem' })
      .toString();
    expect(
      EnableBankingConfig.of({ appId: 'app', privateKey: pkcs1 }).problems()
    ).toEqual(['private_key_invalid']);
  });

  it('refuses a key that is not RSA', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    expect(
      EnableBankingConfig.of({ appId: 'app', privateKey: ec }).problems()
    ).toEqual(['private_key_invalid']);
  });

  it('defaults the API address and drops a trailing slash', () => {
    expect(EnableBankingConfig.of({}).apiUrl).toBe(
      'https://api.enablebanking.com'
    );
    expect(
      EnableBankingConfig.of({ apiUrl: 'http://localhost:8789/' }).apiUrl
    ).toBe('http://localhost:8789');
    expect(
      EnableBankingConfig.fromEnv({ ENABLE_BANKING_API_URL: '' }).apiUrl
    ).toBe('https://api.enablebanking.com');
  });
});
