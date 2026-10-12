import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Role, View } from './types.js';

export interface AccessClaims {
  userId: number;
  role: Role;
  view: View;
}

export interface RefreshClaims {
  userId: number;
  jti: string;
}

/** Any token that is not a valid, unexpired token of ours. It says nothing about why. */
export class InvalidTokenError extends Error {
  constructor() {
    super('invalid token');
  }
}

const ISSUER = 'pachanguero';
const ALGORITHM = 'HS256';

/** The only place that knows the token library: signs and checks the two kinds of token. */
export class TokenService {
  constructor(
    private readonly secret: Uint8Array,
    private readonly accessSeconds: number,
    private readonly refreshSeconds: number
  ) {}

  issueAccess(claims: AccessClaims, now: Date): Promise<string> {
    return this.sign(
      { role: claims.role, view: claims.view, type: 'access' },
      claims.userId,
      now,
      this.accessSeconds
    );
  }

  async issueRefresh(
    userId: number,
    now: Date
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = await this.sign(
      { type: 'refresh' },
      userId,
      now,
      this.refreshSeconds,
      randomUUID()
    );
    const expiresAt = new Date(
      (Math.floor(now.getTime() / 1000) + this.refreshSeconds) * 1000
    );
    return { token, expiresAt };
  }

  async verifyAccess(token: string, now: Date): Promise<AccessClaims> {
    const payload = await this.verify(token, now, 'access');
    const { role, view } = payload;
    if (
      (role !== 'admin' && role !== 'regular') ||
      (view !== 'admin' && view !== 'regular')
    ) {
      throw new InvalidTokenError();
    }
    return { userId: this.userIdOf(payload), role, view };
  }

  async verifyRefresh(token: string, now: Date): Promise<RefreshClaims> {
    const payload = await this.verify(token, now, 'refresh');
    if (typeof payload.jti !== 'string' || payload.jti === '') {
      throw new InvalidTokenError();
    }
    return { userId: this.userIdOf(payload), jti: payload.jti };
  }

  /** What is stored in place of a refresh token. */
  hashOf(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sign(
    claims: JWTPayload,
    userId: number,
    now: Date,
    lifetimeSeconds: number,
    jti?: string
  ): Promise<string> {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuer(ISSUER)
      .setSubject(String(userId))
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + lifetimeSeconds);
    if (jti) jwt.setJti(jti);
    return jwt.sign(this.secret);
  }

  private async verify(
    token: string,
    now: Date,
    type: string
  ): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        currentDate: now,
        requiredClaims: ['exp', 'iat', 'sub', 'type'],
      });
      if (payload.type !== type) throw new InvalidTokenError();
      return payload;
    } catch {
      throw new InvalidTokenError();
    }
  }

  private userIdOf(payload: JWTPayload): number {
    const text = payload.sub ?? '';
    if (!/^[1-9][0-9]*$/.test(text)) throw new InvalidTokenError();
    return Number(text);
  }
}
