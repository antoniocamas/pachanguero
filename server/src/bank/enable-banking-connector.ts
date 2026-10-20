import {
  BankError,
  type AccountRef,
  type BankConnector,
  type BankFailure,
  type BankRef,
  type Clock,
  type RawAccount,
  type RawEntry,
} from '../bizum/ports.js';
import type { EnableBankingConfig } from './enable-banking-config.js';
import type { EnableBankingToken } from './enable-banking-token.js';

/** What a call answered: the status and the JSON body, if it was JSON. */
interface Answer {
  status: number;
  body: Record<string, unknown> | null;
}

interface Call {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

/**
 * Talks to Enable Banking for the application: consent, sessions and the entries of an account.
 * Every failure becomes a `BankError` whose message is only its class and the bank's code, never
 * a URL, a header, a body, the token, an authorisation code or a session id.
 */
export class EnableBankingConnector implements BankConnector {
  static readonly TIMEOUT_MS = 30_000;
  /** How long to wait after a rate-limit answer, the bank's own advice. */
  static readonly RATE_LIMIT_WAIT_MS = 6 * 3_600_000;

  private static readonly SESSION_ENDED = new Set([
    'CLOSED_SESSION',
    'EXPIRED_SESSION',
    'REVOKED_SESSION',
  ]);
  private static readonly CODE_REFUSED = new Set([
    'EXPIRED_AUTHORIZATION_CODE',
    'WRONG_AUTHORIZATION_CODE',
  ]);

  constructor(
    private readonly config: EnableBankingConfig,
    private readonly token: EnableBankingToken,
    private readonly clock: Clock,
    private readonly timeoutMs: number = EnableBankingConnector.TIMEOUT_MS
  ) {}

  async begin(
    redirectUrl: string,
    state: string,
    validUntil: Date,
    bank: BankRef
  ): Promise<string> {
    const answer = await this.call({
      method: 'POST',
      path: '/auth',
      body: {
        access: { valid_until: validUntil.toISOString() },
        aspsp: { name: bank.name, country: bank.country },
        state,
        redirect_url: redirectUrl,
        psu_type: 'personal',
      },
    });
    const url = answer.body?.url;
    if (typeof url !== 'string') throw new BankError('unavailable', 'NO_URL');
    return url;
  }

  async complete(code: string): Promise<{
    sessionId: string;
    validUntil: Date;
    accounts: RawAccount[];
  }> {
    const created = await this.call({
      method: 'POST',
      path: '/sessions',
      body: { code },
    });
    const sessionId = created.body?.session_id;
    const listed = created.body?.accounts;
    if (typeof sessionId !== 'string' || !Array.isArray(listed)) {
      throw new BankError('unavailable', 'BAD_SESSION');
    }
    const session = await this.call({
      method: 'GET',
      path: `/sessions/${encodeURIComponent(sessionId)}`,
    });
    // The end of the consent is `access.valid_until`: the session answer has no such field at its top.
    const access = session.body?.access as
      { valid_until?: unknown } | undefined;
    const validUntil = new Date(String(access?.valid_until));
    if (Number.isNaN(validUntil.getTime())) {
      throw new BankError('unavailable', 'BAD_SESSION');
    }
    const accounts: RawAccount[] = [];
    for (const account of listed as RawAccount[]) {
      const details = await this.call({
        method: 'GET',
        path: `/accounts/${encodeURIComponent(String(account.uid))}/details`,
      });
      accounts.push({ ...account, details: details.body });
    }
    return { sessionId, validUntil, accounts };
  }

  async close(sessionId: string): Promise<void> {
    try {
      await this.call({
        method: 'DELETE',
        path: `/sessions/${encodeURIComponent(sessionId)}`,
      });
    } catch (error) {
      if (error instanceof BankError && error.failure === 'session_ended') {
        return;
      }
      throw error;
    }
  }

  async *entries(
    account: AccountRef,
    dateFrom: string,
    options: { deep: boolean }
  ): AsyncIterable<RawEntry> {
    let continuationKey: string | null = null;
    do {
      const query: Record<string, string> = { date_from: dateFrom };
      if (options.deep) query.strategy = 'longest';
      if (continuationKey !== null) query.continuation_key = continuationKey;
      const page = await this.call({
        method: 'GET',
        path: `/accounts/${encodeURIComponent(account.sessionId)}/transactions`,
        query,
      });
      const transactions = page.body?.transactions;
      if (!Array.isArray(transactions)) {
        throw new BankError('unavailable', 'BAD_PAGE');
      }
      yield* transactions as RawEntry[];
      const next = page.body?.continuation_key;
      continuationKey = typeof next === 'string' && next !== '' ? next : null;
    } while (continuationKey !== null);
  }

  private async call(call: Call): Promise<Answer> {
    const url = new URL(this.config.apiUrl + call.path);
    for (const [name, value] of Object.entries(call.query ?? {})) {
      url.searchParams.set(name, value);
    }
    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        method: call.method,
        headers: {
          authorization: `Bearer ${await this.token.sign()}`,
          ...(call.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
        },
        body: call.body === undefined ? undefined : JSON.stringify(call.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new BankError('unavailable', timedOut ? 'TIMEOUT' : 'NETWORK');
    }
    const body = this.parse(text);
    if (response.ok) {
      if (body === null && text.trim() !== '') {
        throw new BankError('unavailable', `HTTP_${response.status}`);
      }
      return { status: response.status, body };
    }
    throw this.failure({ status: response.status, body });
  }

  private parse(text: string): Record<string, unknown> | null {
    if (text.trim() === '') return null;
    try {
      const value: unknown = JSON.parse(text);
      return typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  /** The failure an error answer means; the bank's code decides, not the status alone. */
  private failure(answer: Answer): BankError {
    const code =
      typeof answer.body?.error === 'string' ? answer.body.error : null;
    const named = (failure: BankFailure) =>
      new BankError(failure, code ?? `HTTP_${answer.status}`);
    if (answer.status >= 500 || answer.body === null) {
      return new BankError('unavailable', `HTTP_${answer.status}`);
    }
    if (code !== null && EnableBankingConnector.SESSION_ENDED.has(code)) {
      return named('session_ended');
    }
    if (code === 'ASPSP_RATE_LIMIT_EXCEEDED') {
      return new BankError(
        'rate_limited',
        code,
        new Date(
          this.clock.now().getTime() + EnableBankingConnector.RATE_LIMIT_WAIT_MS
        )
      );
    }
    if (code !== null && EnableBankingConnector.CODE_REFUSED.has(code)) {
      return named('authorization_failed');
    }
    if (code === 'REDIRECT_URI_NOT_ALLOWED' || answer.status === 401) {
      return named('misconfigured');
    }
    return named('rejected');
  }
}
