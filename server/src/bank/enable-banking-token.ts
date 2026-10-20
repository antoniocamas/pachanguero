import { SignJWT, importPKCS8, type CryptoKey } from 'jose';
import type { Clock } from '../bizum/ports.js';

/**
 * Signs the token every Enable Banking call carries. The only class that holds the private key.
 */
export class EnableBankingToken {
  static readonly LIFETIME_SECONDS = 3600;

  private key: Promise<CryptoKey> | null = null;

  constructor(
    private readonly appId: string,
    private readonly privateKeyPem: string,
    private readonly clock: Clock
  ) {}

  async sign(): Promise<string> {
    this.key ??= importPKCS8(this.privateKeyPem, 'RS256');
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: this.appId })
      .setIssuer('enablebanking.com')
      .setAudience('api.enablebanking.com')
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + EnableBankingToken.LIFETIME_SECONDS)
      .sign(await this.key);
  }
}
