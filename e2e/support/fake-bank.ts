/** The fake bank the end-to-end run starts, driven over its control routes. */
export class FakeBank {
  static readonly PORT = 8789;
  static readonly APP_ID = 'e2e-app';

  constructor(private readonly base = `http://127.0.0.1:${FakeBank.PORT}`) {}

  /** A new entry, as the bank itself would show it (newest first). */
  addEntry(entry: Record<string, unknown>): Promise<void> {
    return this.post('add-entry', entry);
  }

  removeEntry(reference: string): Promise<void> {
    return this.post('remove-entry', { reference });
  }

  /** The next consent ends in a refusal. */
  denyNext(): Promise<void> {
    return this.post('deny-next');
  }

  /** Ends every session by passing its validity. */
  expire(): Promise<void> {
    return this.post('expire', {});
  }

  /** Ends every session as the bank revoking it. */
  revoke(): Promise<void> {
    return this.post('revoke', {});
  }

  rateLimitNext(count = 1): Promise<void> {
    return this.post('rate-limit-next', { count });
  }

  /** Moves the fake's own time forward. */
  advance(ms: number): Promise<void> {
    return this.post('advance', { ms });
  }

  /** The browser at the bank's consent page: where the bank sends it back to, with its state and code. */
  async consent(consentUrl: string): Promise<string> {
    const reply = await fetch(consentUrl, { redirect: 'manual' });
    const location = reply.headers.get('location');
    if (reply.status !== 302 || location === null) {
      throw new Error(`The fake bank did not approve: ${reply.status}`);
    }
    return location;
  }

  private async post(action: string, body: unknown = {}): Promise<void> {
    const reply = await fetch(`${this.base}/__control/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!reply.ok)
      throw new Error(`The fake bank refused ${action}: ${reply.status}`);
  }
}
