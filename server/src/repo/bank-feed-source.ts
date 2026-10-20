import type { FeedSource } from '../bizum/feed.js';
import type { FeedSourceProvider } from '../bizum/bank-poller.js';
import type { BankConnector, BankError } from '../bizum/ports.js';
import type { BankConnectionRepository } from './bank-connection-repository.js';
import type { BankSettingsService } from './bank-settings-service.js';

/** What a read that found the session over tells the connection. */
export interface SessionEndings {
  markEnded(error: BankError): void;
}

/**
 * What the feed reads, from the settings: the chosen account of the connection, from the start
 * date, nothing at all unless the setup is complete. The first read of a session is the deep one.
 */
export class BankFeedSource implements FeedSourceProvider {
  constructor(
    private readonly connector: BankConnector,
    private readonly settings: BankSettingsService,
    private readonly connections: BankConnectionRepository,
    private readonly endings: SessionEndings
  ) {}

  source(): FeedSource | null {
    if (!this.settings.readiness().ready()) return null;
    const connection = this.connections.get();
    const dialect = this.settings.current();
    const account = this.settings.readingAccount();
    const dateFrom = this.settings.startDate();
    if (
      connection === null ||
      dialect === null ||
      account === null ||
      dateFrom === null
    ) {
      return null;
    }
    return {
      connector: this.connector,
      dialect,
      account: { stableId: account.stableId, sessionId: account.sessionId },
      dateFrom,
      deep: !connection.deepReadDone,
    };
  }

  succeeded(source: FeedSource): void {
    if (source.deep) this.connections.markDeepReadDone();
  }

  failed(error: BankError): void {
    this.endings.markEnded(error);
  }
}
