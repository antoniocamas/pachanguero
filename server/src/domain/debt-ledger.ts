import type { MemberKey } from './types.js';
import { ShareKey } from './share-key.js';

/** One share of a game: whose it is and who answers for it. */
export interface Share {
  member: MemberKey;
  holderId: number;
}

export interface DebtShare extends Share {
  amountCents: number;
}

/**
 * What is owed for a game's shares. Each share counts once, however many
 * people could settle it: a guest's share held by their host is the host's
 * debt and no one else's total.
 */
export class DebtLedger {
  private readonly shares: DebtShare[];

  constructor(debts: readonly DebtShare[]) {
    const seen = new Map<string, DebtShare>();
    for (const d of debts) seen.set(new ShareKey(d.member).toString(), d);
    this.shares = [...seen.values()];
  }

  outstandingCents(): number {
    return this.shares.reduce((sum, s) => sum + s.amountCents, 0);
  }

  /** What each holder answers for, shares of other people included. */
  byHolder(): Map<number, number> {
    const totals = new Map<number, number>();
    for (const s of this.shares)
      totals.set(s.holderId, (totals.get(s.holderId) ?? 0) + s.amountCents);
    return totals;
  }

  holdsCents(playerId: number): number {
    return this.byHolder().get(playerId) ?? 0;
  }

  /** How many shares are still owed. */
  count(): number {
    return this.shares.length;
  }
}
