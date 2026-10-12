import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { InvalidTokenError, TokenService } from './token-service.js';

const secret = new TextEncoder().encode(
  'a-secret-of-more-than-thirty-two-chars'
);
const other = new TextEncoder().encode(
  'another-secret-of-more-than-thirty-two'
);
const now = new Date('2026-10-11T10:00:00.000Z');
const seconds = Math.floor(now.getTime() / 1000);

describe('TokenService', () => {
  const tokens = new TokenService(secret, 1800, 30 * 86_400);

  const forge = (
    claims: Record<string, unknown>,
    options: {
      key?: Uint8Array;
      issuer?: string;
      subject?: string;
      exp?: number;
      iat?: boolean;
    } = {}
  ) => {
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(options.issuer ?? 'pachanguero')
      .setExpirationTime(options.exp ?? seconds + 600);
    if (options.subject !== '') jwt.setSubject(options.subject ?? '7');
    if (options.iat !== false) jwt.setIssuedAt(seconds);
    return jwt.sign(options.key ?? secret);
  };
  const access = { role: 'admin', view: 'admin', type: 'access' };
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  it('round-trips an access token with its claims and a 30 minute life', async () => {
    const token = await tokens.issueAccess(
      { userId: 7, role: 'admin', view: 'regular' },
      now
    );
    expect(await tokens.verifyAccess(token, now)).toEqual({
      userId: 7,
      role: 'admin',
      view: 'regular',
    });
    await expect(
      tokens.verifyAccess(token, new Date(now.getTime() + 1799_000))
    ).resolves.toBeDefined();
    await expect(
      tokens.verifyAccess(token, new Date(now.getTime() + 1800_000))
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('round-trips a refresh token with a random id and its expiry', async () => {
    const first = await tokens.issueRefresh(7, now);
    const second = await tokens.issueRefresh(7, now);
    expect(first.token).not.toBe(second.token);
    expect(first.expiresAt).toEqual(new Date(now.getTime() + 30 * 86_400_000));
    const claims = await tokens.verifyRefresh(first.token, now);
    expect(claims.userId).toBe(7);
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('hashes a token to 64 hex characters, the same every time', () => {
    expect(tokens.hashOf('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.hashOf('abc')).toBe(tokens.hashOf('abc'));
    expect(tokens.hashOf('abc')).not.toBe(tokens.hashOf('abd'));
  });

  it('refuses a refresh token used as an access token and the other way round', async () => {
    const refresh = await tokens.issueRefresh(7, now);
    const accessToken = await tokens.issueAccess(
      { userId: 7, role: 'admin', view: 'admin' },
      now
    );
    await expect(
      tokens.verifyAccess(refresh.token, now)
    ).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(tokens.verifyRefresh(accessToken, now)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it.each([
    ['signed with another secret', () => forge(access, { key: other })],
    ['from another issuer', () => forge(access, { issuer: 'someone-else' })],
    ['expired', () => forge(access, { exp: seconds - 1 })],
    ['without a subject', () => forge(access, { subject: '' })],
    ['without an issue time', () => forge(access, { iat: false })],
    ['with a non-numeric subject', () => forge(access, { subject: 'admin' })],
    ['with a subject of zero', () => forge(access, { subject: '0' })],
    ['with an unknown role', () => forge({ ...access, role: 'owner' })],
    ['with an unknown view', () => forge({ ...access, view: 'superuser' })],
    ['without a type', () => forge({ role: 'admin', view: 'admin' })],
  ])('refuses a token %s', async (_label, make) => {
    await expect(tokens.verifyAccess(await make(), now)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it('refuses a token whose payload was edited under the original signature', async () => {
    const token = await forge({ ...access, role: 'regular', view: 'regular' });
    const [header, , signature] = token.split('.');
    const edited = `${header}.${encode({ ...access, iss: 'pachanguero', sub: '7', iat: seconds, exp: seconds + 600 })}.${signature}`;
    await expect(tokens.verifyAccess(edited, now)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it('refuses an unsigned token with algorithm none', async () => {
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      ...access,
      iss: 'pachanguero',
      sub: '7',
      iat: seconds,
      exp: seconds + 600,
    })}.`;
    await expect(tokens.verifyAccess(unsigned, now)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it.each([[''], ['not a token'], ['a.b.c']])('refuses %j', async garbage => {
    await expect(tokens.verifyAccess(garbage, now)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });
});
