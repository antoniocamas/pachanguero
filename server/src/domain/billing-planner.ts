import { ShareKey } from './share-key.js';
import type { Share } from './debt-ledger.js';

/** Decides which of a game's shares still have to be billed. */
export class BillingPlanner {
  /**
   * The shares with neither a debt nor a payment yet. `billedKeys` holds the
   * keys of both, so playing a game again never bills a share twice.
   */
  unbilled(shares: readonly Share[], billedKeys: ReadonlySet<string>): Share[] {
    return shares.filter(
      s => !billedKeys.has(new ShareKey(s.member).toString())
    );
  }
}
