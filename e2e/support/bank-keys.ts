import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The key pair the end-to-end run signs bank calls with. Made once per run, in memory and in
 * the environment (so Playwright's workers, which load the config again, see the same pair); the
 * public half goes to a file in the git-ignored scratch folder for the fake bank to read.
 */
export class BankKeys {
  readonly privatePem: string;
  readonly publicPem: string;

  constructor(private readonly publicFile: string) {
    const existingPrivate = process.env.E2E_BANK_PRIVATE_KEY;
    const existingPublic = process.env.E2E_BANK_PUBLIC_KEY;
    if (existingPrivate !== undefined && existingPublic !== undefined) {
      this.privatePem = existingPrivate;
      this.publicPem = existingPublic;
      return;
    }
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.privatePem = pair.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    this.publicPem = pair.publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();
    process.env.E2E_BANK_PRIVATE_KEY = this.privatePem;
    process.env.E2E_BANK_PUBLIC_KEY = this.publicPem;
    mkdirSync(dirname(publicFile), { recursive: true });
    writeFileSync(publicFile, this.publicPem);
  }
}
