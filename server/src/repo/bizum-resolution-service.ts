import type Database from 'better-sqlite3';
import type { BankEntryLedger } from '../bizum/feed.js';
import type { BizumStore, StoredBizum } from '../bizum/ports.js';
import type {
  BizumRuleSet,
  OpenShare,
  SenderIdentity,
  WaitReason,
} from '../domain/bizum-rules.js';
import type { BizumFactsReader } from './bizum-facts-reader.js';
import type { BizumHandlingRepository } from './bizum-handling-repository.js';
import type { BizumSettlementService } from './bizum-settlement-service.js';
import type { PlayerRepository } from './player-repository.js';

/** A refusal the organiser reads: what was asked cannot be done, and why. */
export class BizumRefusal extends Error {}

/** A waiting Bizum as the organiser sees it. */
export interface WaitingBizum {
  id: number;
  bookedOn: string;
  amountCents: number;
  currency: string;
  /** As the bank showed it. */
  sender: { name: string | null; phone: string | null };
  subject: string | null;
  /** What the rules last decided, not recomputed. */
  reason: WaitReason;
  /** Names for every player the reason or the sender mentions. */
  players: Record<number, string>;
  /** Who the sender is now: suggestions are fresh, they decide nothing. */
  senderIdentity: SenderIdentity;
}

export interface Reevaluated {
  bizumId: number;
  status: 'settled' | 'waiting';
}

export interface Ruling {
  shares: number;
  unallocatedCents: number;
}

/**
 * What the organiser does with a waiting Bizum, and the one way a waiting Bizum is judged again:
 * always in `review` mode, so nothing is discarded, through the same settlement as every other
 * trigger. The changes the organiser asks for are one transaction each; `reevaluate` leaves the
 * transaction to its caller.
 */
export class BizumResolutionService {
  constructor(
    private readonly store: BizumStore,
    private readonly ledger: BankEntryLedger,
    private readonly handling: BizumHandlingRepository,
    private readonly facts: BizumFactsReader,
    private readonly rules: BizumRuleSet,
    private readonly settlement: BizumSettlementService,
    private readonly players: PlayerRepository,
    private readonly conn: Database.Database
  ) {}

  /** The waiting Bizums, oldest booking first. */
  waiting(): WaitingBizum[] {
    const names = new Map(this.players.listAll().map(p => [p.id, p.name]));
    return this.handling.waitingByBooking().flatMap(handling => {
      const stored = this.store.find(handling.bizumId);
      if (stored === null || handling.reason === null) return [];
      const { bizum } = stored;
      const senderIdentity = this.facts.identify(bizum.sender);
      const mentioned = [
        ...this.playersIn(handling.reason),
        ...this.playersOf(senderIdentity),
      ];
      return [
        {
          id: stored.id,
          bookedOn: bizum.bookedOn,
          amountCents: bizum.amountCents,
          currency: bizum.currency,
          sender: { name: bizum.sender.name, phone: bizum.sender.phone },
          subject: bizum.subject,
          reason: handling.reason,
          players: Object.fromEntries(
            mentioned.flatMap(id => {
              const name = names.get(id);
              return name === undefined ? [] : [[id, name] as const];
            })
          ),
          senderIdentity,
        },
      ];
    });
  }

  /** The shares this player owes that the Bizum could pay, nearest first. */
  openShares(bizumId: number, playerId: number): OpenShare[] {
    const stored = this.waitingBizum(bizumId);
    this.requirePlayer(playerId);
    return this.facts.openSharesOf(playerId, stored.bizum);
  }

  /**
   * The organiser rules that the Bizum pays this many of the player's shares, nearest first,
   * whatever its amount: the rest is left on the Bizum. It decides this Bizum only, and never
   * pays shares worth more than the Bizum.
   */
  rule(bizumId: number, playerId: number, shares: number): Ruling {
    return this.conn.transaction(() => {
      const stored = this.waitingBizum(bizumId);
      this.requirePlayer(playerId);
      if (!Number.isInteger(shares) || shares < 1) {
        throw new BizumRefusal('Indica cuántas cuotas paga el Bizum');
      }
      const open = this.facts.openSharesOf(playerId, stored.bizum);
      if (shares > open.length) {
        throw new BizumRefusal(
          open.length === 1
            ? 'Solo tiene 1 cuota abierta en esa temporada'
            : `Solo tiene ${open.length} cuotas abiertas en esa temporada`
        );
      }
      const chosen = open.slice(0, shares);
      const owed = chosen.reduce((sum, share) => sum + share.amountCents, 0);
      if (owed > stored.bizum.amountCents) {
        throw new BizumRefusal(
          shares === 1
            ? 'El Bizum no cubre 1 cuota'
            : `El Bizum no cubre ${shares} cuotas`
        );
      }
      this.settlement.settle(stored, playerId, chosen, 'organiser');
      const settled = this.handling.get(bizumId);
      return { shares, unallocatedCents: settled?.unallocatedCents ?? 0 };
    })();
  }

  /**
   * Forgets the Bizum for good: the bank's identification stays, marked dismissed, so it is never
   * read or judged again; the sender, subject and amount go with the row.
   */
  dismiss(bizumId: number): void {
    this.conn.transaction(() => {
      const stored = this.store.find(bizumId);
      if (stored === null) throw new BizumRefusal('No existe ese Bizum');
      if (this.handling.get(bizumId)?.status === 'settled') {
        throw new BizumRefusal('Deshaz antes sus pagos');
      }
      this.ledger.dismiss(stored.bizum.key);
      this.store.remove(bizumId);
    })();
  }

  /**
   * Judges these Bizums again, in the order given, each against what the ones before settled.
   * One no longer waiting is left alone. The caller holds the transaction.
   */
  reevaluate(bizumIds: readonly number[]): Reevaluated[] {
    return bizumIds.flatMap(bizumId => {
      const stored = this.store.find(bizumId);
      if (stored === null || this.handling.get(bizumId)?.status !== 'waiting') {
        return [];
      }
      this.settlement.apply(
        stored,
        this.rules.judge(this.facts.read(stored.bizum), 'review')
      );
      const status = this.handling.get(bizumId)?.status ?? 'waiting';
      return [{ bizumId, status }];
    });
  }

  private waitingBizum(bizumId: number): StoredBizum {
    const stored = this.store.find(bizumId);
    if (stored === null) throw new BizumRefusal('No existe ese Bizum');
    if (this.handling.get(bizumId)?.status !== 'waiting') {
      throw new BizumRefusal('Ese Bizum ya no está en espera');
    }
    return stored;
  }

  private requirePlayer(playerId: number): void {
    if (this.players.nameOf(playerId) === undefined) {
      throw new BizumRefusal('No existe ese jugador');
    }
  }

  private playersIn(reason: WaitReason): number[] {
    if (reason.code === 'not_enough_debts') return [reason.playerId];
    if (reason.code === 'sender_ambiguous') return reason.playerIds;
    return [];
  }

  private playersOf(identity: SenderIdentity): number[] {
    if (identity.kind === 'player') return [identity.playerId];
    return identity.kind === 'ambiguous'
      ? identity.playerIds
      : identity.suggestions;
  }
}
