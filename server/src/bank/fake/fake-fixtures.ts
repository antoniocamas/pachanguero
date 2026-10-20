import { readFileSync } from 'node:fs';
import type { RawEntry } from '../../bizum/ports.js';

/** An account as the fake bank holds it, before a session gives it a `uid`. */
export interface FakeAccountTemplate {
  identification_hash: string;
  currency: string;
  cash_account_type: string;
  usage: string;
  account_id: { iban: string };
}

/** The anonymised data the fake bank starts from: invented names and numbers only. */
export class FakeFixtures {
  accounts(): FakeAccountTemplate[] {
    return this.read('accounts.json') as FakeAccountTemplate[];
  }

  /** Revolut-shaped entries of the first account, newest first, over a hundred of them. */
  entries(): RawEntry[] {
    return this.read('entries.json') as RawEntry[];
  }

  private read(file: string): unknown {
    return JSON.parse(
      readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8')
    );
  }
}
