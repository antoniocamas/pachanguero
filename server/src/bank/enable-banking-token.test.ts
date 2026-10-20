import { generateKeyPairSync } from 'node:crypto';
import { decodeProtectedHeader, importSPKI, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../domain/clock-test-support.js';
import { EnableBankingToken } from './enable-banking-token.js';

describe('EnableBankingToken', () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = pair.privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const publicPem = pair.publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString();
  const clock = new ManualClock(new Date('2026-10-19T10:00:00.000Z'));
  const token = new EnableBankingToken('app-1', privatePem, clock);

  it('carries the type, algorithm and application id in its header', async () => {
    expect(decodeProtectedHeader(await token.sign())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
      kid: 'app-1',
    });
  });

  it('is verified by the public half, with the issuer, audience and an hour of life', async () => {
    const { payload } = await jwtVerify(
      await token.sign(),
      await importSPKI(publicPem, 'RS256'),
      {
        issuer: 'enablebanking.com',
        audience: 'api.enablebanking.com',
        currentDate: clock.now(),
      }
    );
    const issuedAt = Date.parse('2026-10-19T10:00:00.000Z') / 1000;
    expect(payload.iat).toBe(issuedAt);
    expect(payload.exp).toBe(issuedAt + 3600);
  });

  it('is refused by another key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .publicKey.export({ type: 'spki', format: 'pem' })
      .toString();
    await expect(
      jwtVerify(await token.sign(), await importSPKI(other, 'RS256'))
    ).rejects.toThrow();
  });

  it('is signed afresh from the clock for every call', async () => {
    const first = await token.sign();
    clock.advance(5000);
    const second = await token.sign();
    expect(second).not.toBe(first);
    clock.advance(-5000);
  });
});
