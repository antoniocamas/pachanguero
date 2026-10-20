import type { APIRequestContext } from '@playwright/test';
import Database from 'better-sqlite3';
import { expect } from '@playwright/test';
import { FakeBank } from './fake-bank';

/** The account of the fake bank the journeys read: the first of its two EUR accounts. */
export const READ_ACCOUNT = 'hash-eur-principal';

/** Today, as the server reads it for the start date. */
export const today = () => new Date().toISOString().slice(0, 10);

/**
 * A Bizum as the fake bank lists it, in the shape the Revolut dialect reads: a credit, with
 * the subject first and the sender after the prefix. Booked today, after the start date.
 */
export const incomingBizum = (entry: {
  reference: string;
  amount: string;
  sender: string;
  subject: string;
}): Record<string, unknown> => ({
  entry_reference: entry.reference,
  status: 'BOOK',
  credit_debit_indicator: 'CRDT',
  transaction_amount: { amount: entry.amount, currency: 'EUR' },
  booking_date: today(),
  value_date: today(),
  bank_transaction_code: { code: 'TOPUP', description: null, sub_code: null },
  debtor: { name: null },
  creditor: { name: null },
  remittance_information: [
    entry.subject,
    `Bizum payment from: ${entry.sender}`,
  ],
});

/**
 * Lets a read start again at once. The server keeps at least five minutes between two reads
 * and the journeys cannot wait that long, so the record of the last read is removed from the
 * database the server uses, as if the time had passed.
 */
export class ReadGap {
  constructor(private readonly path = process.env.E2E_DB ?? '') {}

  reopen(): void {
    const db = new Database(this.path);
    try {
      db.prepare('DELETE FROM bizum_feed_state').run();
    } finally {
      db.close();
    }
  }
}

/** Connects the fake bank through the API, as the screen's buttons would, and chooses what to read. */
export class ConnectedBank {
  constructor(
    private readonly request: APIRequestContext,
    private readonly fake = new FakeBank()
  ) {}

  /** Leaves the bank connected, its account chosen and its start date today; keeps a working connection. */
  async ensure(): Promise<void> {
    const panel = await (await this.request.get('/api/bank')).json();
    if (panel.connection?.state !== 'connected') await this.connect();
    const set = await this.request.put('/api/bank/settings', {
      data: { accountStableId: READ_ACCOUNT, startDate: today() },
    });
    expect(set.ok(), await set.text()).toBeTruthy();
  }

  private async connect(): Promise<void> {
    const started = await this.request.post('/api/bank/connect');
    expect(started.ok(), await started.text()).toBeTruthy();
    const { url } = (await started.json()) as { url: string };
    const consent = await this.fake.consent(url);
    const callback = await this.request.get(consent, { maxRedirects: 0 });
    expect(callback.status()).toBe(302);
    expect(callback.headers().location).toBe('/?bank=connected');
  }
}
