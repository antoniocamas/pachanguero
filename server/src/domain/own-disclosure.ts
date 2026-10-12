/** A share still owed, as the debt read returns it. */
export interface DebtInput {
  gameId: number;
  playedOn: string;
  gameLabel: string | null;
  holderId: number;
  holderName: string;
  /** The player the share is for; null for an anonymous plus-one. */
  beneficiaryId: number | null;
  amountCents: number;
}

/** A share settled, as the payment read returns it. */
export interface PaymentInput {
  gameId: number;
  playedOn: string;
  gameLabel: string | null;
  holderId: number;
  payerId: number;
  payerName: string;
  beneficiaryId: number | null;
  amountCents: number;
  paidOn: string;
}

export interface OwnDebtRow {
  gameId: number;
  playedOn: string;
  label: string | null;
  amountCents: number;
  kind: 'own' | 'guest';
}

export interface HeldRow {
  gameId: number;
  playedOn: string;
  label: string | null;
  amountCents: number;
  holderName: string;
}

export interface OwnDebts {
  owedCents: number;
  mine: OwnDebtRow[];
  heldByHost: HeldRow[];
}

export interface OwnPaymentRow {
  gameId: number;
  playedOn: string;
  label: string | null;
  amountCents: number;
  paidOn: string;
  kind: 'own' | 'guest';
  /** Null when the player paid; a name only when the share's holder paid; else "other". */
  paidBy: { name: string } | 'other' | null;
}

/** The part of a player report this class rewrites. */
export interface DisclosableReport {
  games: Array<{ stats: Record<string, unknown> }>;
  seasonStats: Record<string, unknown>;
}

interface PaymentValueLike {
  status: string;
  holderId?: number;
  payerId?: number;
  payerName?: string;
}

/**
 * What one player may be told about money and standing: their own shares and the ones they
 * hold for guests, never another player's name or id (except the host answering for their
 * share), and no position among the others. Every privacy rule of the player's own view is here.
 */
export class OwnDisclosure {
  constructor(private readonly viewerId: number) {}

  debts(rows: readonly DebtInput[]): OwnDebts {
    const result: OwnDebts = { owedCents: 0, mine: [], heldByHost: [] };
    for (const d of rows) {
      const own = d.beneficiaryId === this.viewerId;
      if (d.holderId === this.viewerId) {
        result.mine.push({
          gameId: d.gameId,
          playedOn: d.playedOn,
          label: d.gameLabel,
          amountCents: d.amountCents,
          kind: own ? 'own' : 'guest',
        });
        result.owedCents += d.amountCents;
      } else if (own) {
        result.heldByHost.push({
          gameId: d.gameId,
          playedOn: d.playedOn,
          label: d.gameLabel,
          amountCents: d.amountCents,
          holderName: d.holderName,
        });
      }
    }
    return result;
  }

  payments(rows: readonly PaymentInput[]): OwnPaymentRow[] {
    const result: OwnPaymentRow[] = [];
    for (const p of rows) {
      const own = p.beneficiaryId === this.viewerId;
      if (!own && p.payerId !== this.viewerId) continue;
      result.push({
        gameId: p.gameId,
        playedOn: p.playedOn,
        label: p.gameLabel,
        amountCents: p.amountCents,
        paidOn: p.paidOn,
        kind: own ? 'own' : 'guest',
        paidBy: this.paidBy(p),
      });
    }
    return result;
  }

  /** The report without any player id, the payer's name unless it is the holder's, or the standing. */
  report<T extends DisclosableReport>(report: T): T {
    const seasonStats = { ...report.seasonStats };
    const points = seasonStats.points as Record<string, unknown> | null;
    if (points) {
      const kept = { ...points };
      delete kept.rank;
      delete kept.of;
      seasonStats.points = kept;
    }
    return {
      ...report,
      seasonStats,
      games: report.games.map(game => ({
        ...game,
        stats: this.stats(game.stats),
      })),
    };
  }

  private paidBy(p: PaymentInput): OwnPaymentRow['paidBy'] {
    if (p.payerId === this.viewerId) return null;
    return p.payerId === p.holderId ? { name: p.payerName } : 'other';
  }

  private stats(stats: Record<string, unknown>): Record<string, unknown> {
    const payment = stats.payment as PaymentValueLike | undefined;
    if (!payment) return stats;
    const { holderId, payerId, payerName } = payment;
    const kept: Record<string, unknown> = { ...payment };
    delete kept.holderId;
    delete kept.payerId;
    delete kept.payerName;
    // Named only when someone else answering for the share paid it: the player's own
    // payments need no "por <themselves>".
    if (
      payerName !== undefined &&
      payerId === holderId &&
      payerId !== this.viewerId
    )
      kept.payerName = payerName;
    return { ...stats, payment: kept };
  }
}
