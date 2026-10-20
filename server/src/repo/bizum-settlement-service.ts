import type { StoredBizum } from '../bizum/ports.js';
import type { Clock } from '../domain/clock.js';
import type {
  OpenShare,
  SenderIdentity,
  Verdict,
  WaitReason,
} from '../domain/bizum-rules.js';
import {
  BizumHandlingRepository,
  type SettledHow,
} from './bizum-handling-repository.js';
import type { ShareSettler } from './share-settler.js';

/** What becomes of the money of a Bizum that no share takes: kept on it, or dismissed. */
export type RestOfBizum = 'keep' | 'dismiss';

/**
 * Writes what a verdict means for a kept Bizum: shares paid through the one payment writer, or a
 * waiting row with its reason. Every trigger that judges a Bizum calls these same methods, so one
 * Bizum cannot be settled two ways. The caller holds the transaction.
 */
export class BizumSettlementService {
  constructor(
    private readonly settler: ShareSettler,
    private readonly handling: BizumHandlingRepository,
    private readonly clock: Clock
  ) {}

  apply(stored: StoredBizum, verdict: Verdict): void {
    if (verdict.action === 'settle') {
      this.settle(stored, verdict.playerId, verdict.shares, 'automatic');
    } else if (verdict.action === 'wait') {
      this.wait(stored, verdict.reason, verdict.sender);
    }
  }

  /**
   * Pays the shares in order; a Bizum that does not cover their amounts pays nothing and waits.
   * What is left of the Bizum stays on it unassigned, unless the organiser has it dismissed.
   */
  settle(
    stored: StoredBizum,
    playerId: number,
    shares: readonly OpenShare[],
    how: SettledHow,
    rest: RestOfBizum = 'keep'
  ): void {
    const owed = shares.reduce((sum, share) => sum + share.amountCents, 0);
    if (owed > stored.bizum.amountCents) {
      this.wait(
        stored,
        { code: 'amounts_differ' },
        { kind: 'player', playerId }
      );
      return;
    }
    let paid = 0;
    for (const share of shares) {
      paid += this.settler.settle(share.gameId, share.member, {
        payerPlayerId: playerId,
        paidOn: stored.bizum.bookedOn,
        method: 'bizum',
        bizumId: stored.id,
      }).amount_cents;
    }
    this.handling.markSettled(
      stored.id,
      how,
      rest === 'dismiss' ? 0 : stored.bizum.amountCents - paid,
      this.clock.now()
    );
  }

  wait(stored: StoredBizum, reason: WaitReason, sender: SenderIdentity): void {
    this.handling.markWaiting(stored.id, reason, sender, this.clock.now());
  }
}
