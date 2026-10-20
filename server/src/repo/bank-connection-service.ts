import { createHash, randomBytes } from 'node:crypto';
import {
  BankError,
  type AccountChoice,
  type BankConnector,
  type BizumDialect,
} from '../bizum/ports.js';
import type { Clock } from '../domain/clock.js';
import { ConnectionClock } from '../domain/connection-clock.js';
import type { PublicUrl } from '../domain/public-url.js';
import type { BankAuthorizationRepository } from './bank-authorization-repository.js';
import type {
  BankConnectionRepository,
  ConnectionState,
  StoredConnection,
} from './bank-connection-repository.js';

/** One thing missing from the setup, by a fixed code and the name of the setting. */
export interface SetupProblem {
  code: string;
  setting: string;
}

/** What is missing before a connection can be started. */
export interface SetupCheck {
  problems(): SetupProblem[];
}

/** Which bank is read; null when none is supported. */
export interface BankChoice {
  current(): BizumDialect | null;
}

/** Where the random state of an authorisation comes from. */
export interface StateSource {
  next(): string;
}

export class RandomStateSource implements StateSource {
  next(): string {
    return randomBytes(32).toString('base64url');
  }
}

/** What the browser is told when the bank sends it back: a fixed code, never text. */
export type CallbackOutcome =
  | 'connected'
  | 'unknown_state'
  | 'already_used'
  | 'expired'
  | 'denied'
  | 'bank_error'
  | 'code_rejected'
  | 'failed';

/** A refusal the organiser is told in words. */
export class BankRefusal extends Error {}

export interface PanelConnection {
  state: ConnectionState;
  validUntil: string;
  daysLeft: number;
  renewSuggested: boolean;
  reason: string | null;
  accounts: Pick<AccountChoice, 'stableId' | 'currency' | 'kind' | 'last4'>[];
}

export interface BankPanel {
  setup: SetupProblem[];
  bank: { id: string; displayName: string } | null;
  canConnect: boolean;
  connection: PanelConnection | null;
}

export interface BankBanner {
  show: boolean;
  state: ConnectionState | 'none';
  daysLeft: number | null;
}

/** Connects, completes, renews and disconnects the bank access, and tells how long it lasts. */
export class BankConnectionService {
  private static readonly STATE_FORMAT = /^[A-Za-z0-9_-]{1,128}$/;
  private static readonly DAY_MS = 86_400_000;

  constructor(
    private readonly connector: BankConnector,
    private readonly authorizations: BankAuthorizationRepository,
    private readonly connections: BankConnectionRepository,
    private readonly publicUrl: PublicUrl,
    private readonly setup: SetupCheck,
    private readonly choice: BankChoice,
    private readonly clock: Clock,
    private readonly states: StateSource
  ) {}

  panel(): BankPanel {
    const dialect = this.choice.current();
    const setup = this.setup.problems();
    const stored = this.connections.get();
    return {
      setup,
      bank:
        dialect === null
          ? null
          : { id: dialect.id, displayName: dialect.displayName },
      canConnect: setup.length === 0 && dialect !== null,
      connection: stored === null ? null : this.viewOf(stored),
    };
  }

  /** Starts an authorisation and answers where the bank's page is. */
  async connect(): Promise<{ url: string }> {
    const problems = this.setup.problems();
    if (problems.length > 0) {
      throw new BankRefusal(
        `Falta configurar: ${problems.map(p => p.setting).join(', ')}`
      );
    }
    const dialect = this.choice.current();
    if (dialect === null) {
      throw new BankRefusal('No hay ningún banco compatible elegido');
    }
    const now = this.clock.now();
    const state = this.states.next();
    this.authorizations.deleteStale(now);
    this.authorizations.create({
      stateHash: this.hashOf(state),
      bankId: dialect.id,
      purpose: this.connections.get() === null ? 'connect' : 'renew',
      createdAt: now,
      expiresAt: new Date(
        now.getTime() + ConnectionClock.PENDING_MINUTES * 60_000
      ),
    });
    let url: string;
    try {
      url = await this.connector.begin(
        this.publicUrl.callbackUrl(),
        state,
        new Date(
          now.getTime() +
            ConnectionClock.CONSENT_DAYS * BankConnectionService.DAY_MS
        ),
        dialect.bank
      );
    } catch (error) {
      throw this.refusalFor(error);
    }
    if (!this.acceptable(url)) {
      throw new BankRefusal('El banco devolvió una dirección que no es segura');
    }
    return { url };
  }

  /** Completes what the bank's redirect asks for. Never throws: every failure is an outcome. */
  async complete(query: {
    state: string | null;
    code: string | null;
    error: string | null;
  }): Promise<CallbackOutcome> {
    const state = query.state ?? '';
    if (!BankConnectionService.STATE_FORMAT.test(state)) return 'unknown_state';
    const hash = this.hashOf(state);
    const pending = this.authorizations.findByHash(hash);
    if (pending === null) return 'unknown_state';
    if (pending.usedAt !== null) return 'already_used';
    const now = this.clock.now();
    if (now.getTime() >= pending.expiresAt.getTime()) return 'expired';
    // Used before the exchange, so a replay cannot exchange twice while the first is in flight.
    this.authorizations.markUsed(hash, now);
    if (query.error !== null) {
      return query.error === 'access_denied' ? 'denied' : 'bank_error';
    }
    if (query.code === null || query.code === '') return 'failed';
    const dialect = this.choice.current();
    if (dialect === null || dialect.id !== pending.bankId) return 'failed';
    try {
      const session = await this.connector.complete(query.code);
      const accounts = session.accounts.map(raw =>
        dialect.describeAccount(raw)
      );
      const previous = this.connections.get();
      this.connections.save({
        bankId: dialect.id,
        sessionId: session.sessionId,
        validUntil: session.validUntil,
        connectedAt: now,
        accounts,
      });
      if (pending.purpose === 'renew' && previous !== null) {
        await this.closeQuietly(previous.sessionId);
      }
      return 'connected';
    } catch (error) {
      return error instanceof BankError &&
        error.failure === 'authorization_failed'
        ? 'code_rejected'
        : 'failed';
    }
  }

  /** Closes the session at the bank and forgets it; a bank that cannot be reached is told later by itself. */
  async disconnect(): Promise<{ closedAtBank: boolean }> {
    const stored = this.connections.get();
    if (stored === null)
      throw new BankRefusal('No hay una conexión con el banco');
    let closedAtBank = true;
    try {
      await this.connector.close(stored.sessionId);
    } catch {
      closedAtBank = false;
    }
    this.connections.delete();
    return { closedAtBank };
  }

  /** A read found the session over: the organiser must connect again. */
  markEnded(error: BankError): void {
    if (error.failure === 'session_ended') {
      this.connections.markReconnectNeeded(error.code);
    }
  }

  banner(): BankBanner {
    const stored = this.connections.get();
    if (stored === null) return { show: false, state: 'none', daysLeft: null };
    const view = this.viewOf(stored);
    return {
      show: view.state === 'reconnect_needed' || view.renewSuggested,
      state: view.state,
      daysLeft: view.daysLeft,
    };
  }

  private viewOf(stored: StoredConnection): PanelConnection {
    const clock = new ConnectionClock(stored.validUntil, this.clock.now());
    const passed = stored.state === 'connected' && clock.passed();
    return {
      state: passed ? 'reconnect_needed' : stored.state,
      validUntil: stored.validUntil.toISOString(),
      daysLeft: clock.daysLeft(),
      renewSuggested: clock.renewSuggested(),
      reason: passed ? 'EXPIRED' : stored.reason,
      accounts: stored.accounts.map(account => ({
        stableId: account.stableId,
        currency: account.currency,
        kind: account.kind,
        last4: account.last4,
      })),
    };
  }

  private async closeQuietly(sessionId: string): Promise<void> {
    try {
      await this.connector.close(sessionId);
    } catch {
      // The old session ends by itself.
    }
  }

  private refusalFor(error: unknown): BankRefusal {
    if (error instanceof BankError && error.failure === 'misconfigured') {
      return new BankRefusal(
        error.code === 'REDIRECT_URI_NOT_ALLOWED'
          ? 'La dirección de vuelta no está registrada en el banco'
          : 'La conexión con el banco está mal configurada'
      );
    }
    return new BankRefusal(
      'No se pudo contactar con el banco. Inténtalo más tarde'
    );
  }

  /** The bank's page must be https, or this machine for development. */
  private acceptable(address: string): boolean {
    try {
      const url = new URL(address);
      const local =
        url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      return url.protocol === 'https:' || (url.protocol === 'http:' && local);
    } catch {
      return false;
    }
  }

  private hashOf(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }
}
