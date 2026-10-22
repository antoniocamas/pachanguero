import type Database from 'better-sqlite3';
import type { BankEntryLedger } from '../bizum/feed.js';
import type { BizumStore, StoredBizum } from '../bizum/ports.js';
import type {
  BizumRuleSet,
  RulableShare,
  SenderIdentity,
  WaitReason,
} from '../domain/bizum-rules.js';
import type { BizumFactsReader } from './bizum-facts-reader.js';
import type { BizumHandlingRepository } from './bizum-handling-repository.js';
import type {
  BizumSettlementService,
  RestOfBizum,
} from './bizum-settlement-service.js';
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
  /**
   * When the Bizum waits for lack of debts: the dates of the games after its booking that the
   * player still owes, earliest first. The organiser may pay those; the rules never do.
   */
  laterGames: string[];
}

/** A Bizum that is settled: what it was and the debts it paid. */
export interface SettledBizum {
  id: number;
  bookedOn: string;
  amountCents: number;
  currency: string;
  sender: { name: string | null; phone: string | null };
  subject: string | null;
  settledHow: 'automatic' | 'organiser';
  unallocatedCents: number;
  /** Earliest game first. */
  payments: {
    paymentId: number;
    gameId: number;
    playedOn: string;
    /** Whose share it paid; a guest's is named after the player who brought them. */
    playerName: string;
    amountCents: number;
  }[];
}

export interface Reevaluated {
  bizumId: number;
  status: 'settled' | 'waiting';
  bookedOn: string;
  amountCents: number;
  /** The dates of the games it paid, earliest first; none while it waits. */
  games: string[];
}

export interface Ruling {
  shares: number;
  unallocatedCents: number;
}

/** In a ruling, how many of another player's own shares the Bizum pays for them. */
export interface SharesFor {
  playerId: number;
  shares: number;
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
          laterGames: this.laterGames(handling.reason, bizum),
        },
      ];
    });
  }

  /** The settled Bizums, newest booking first, each with the debts it paid. */
  settled(): SettledBizum[] {
    return this.handling.settledByBooking().flatMap(handling => {
      const stored = this.store.find(handling.bizumId);
      if (stored === null) return [];
      const { bizum } = stored;
      return [
        {
          id: stored.id,
          bookedOn: bizum.bookedOn,
          amountCents: bizum.amountCents,
          currency: bizum.currency,
          sender: { name: bizum.sender.name, phone: bizum.sender.phone },
          subject: bizum.subject,
          settledHow: handling.settledHow ?? 'automatic',
          unallocatedCents: handling.unallocatedCents,
          payments: this.paymentsOf(stored.id),
        },
      ];
    });
  }

  /**
   * The shares this player owes that the organiser may pay with the Bizum: the nearest first
   * among the games up to its booking, then the games after it, earliest first. `ownOnly` keeps
   * the player's own shares, the ones another sender may pay for them.
   */
  openShares(
    bizumId: number,
    playerId: number,
    ownOnly = false
  ): RulableShare[] {
    const stored = this.waitingBizum(bizumId);
    this.requirePlayer(playerId);
    return this.sharesOf(playerId, stored.bizum, ownOnly);
  }

  /**
   * The organiser rules that the Bizum pays this many of the player's shares, nearest first,
   * whatever its amount, among those of games up to its booking and, after them, the later ones.
   * It may also pay, for `others`, that many of each one's own shares, nearest first: the player
   * pays for them, as a regular paying for a friend. The rest is left on the Bizum unassigned, or
   * dismissed when the organiser says so. It decides this Bizum only, and never pays shares worth
   * more than the Bizum.
   */
  rule(
    bizumId: number,
    playerId: number,
    shares: number,
    rest: RestOfBizum = 'keep',
    others: readonly SharesFor[] = []
  ): Ruling {
    return this.conn.transaction(() => {
      const stored = this.waitingBizum(bizumId);
      this.requirePlayer(playerId);
      if (
        !Number.isInteger(shares) ||
        shares < 0 ||
        (shares === 0 && others.length === 0)
      ) {
        throw new BizumRefusal('Indica cuántas cuotas paga el Bizum');
      }
      if (rest !== 'keep' && rest !== 'dismiss') {
        throw new BizumRefusal('Indica qué se hace con el resto del Bizum');
      }
      const open = this.facts.candidateSharesOf(playerId, stored.bizum);
      if (shares > open.length) {
        throw new BizumRefusal(
          open.length === 1
            ? 'Solo tiene 1 cuota abierta en esa temporada'
            : `Solo tiene ${open.length} cuotas abiertas en esa temporada`
        );
      }
      const chosen = [
        ...open.slice(0, shares),
        ...others.flatMap(other =>
          this.sharesForOther(stored.bizum, playerId, other)
        ),
      ];
      if (new Set(chosen.map(s => s.debtId)).size !== chosen.length) {
        throw new BizumRefusal('Has elegido la misma cuota dos veces');
      }
      const owed = chosen.reduce((sum, share) => sum + share.amountCents, 0);
      if (owed > stored.bizum.amountCents) {
        throw new BizumRefusal(
          chosen.length === 1
            ? 'El Bizum no cubre 1 cuota'
            : `El Bizum no cubre ${chosen.length} cuotas`
        );
      }
      this.settlement.settle(stored, playerId, chosen, 'organiser', rest);
      const settled = this.handling.get(bizumId);
      return {
        shares: chosen.length,
        unallocatedCents: settled?.unallocatedCents ?? 0,
      };
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

  private sharesOf(
    playerId: number,
    bizum: StoredBizum['bizum'],
    ownOnly: boolean
  ): RulableShare[] {
    const all = this.facts.candidateSharesOf(playerId, bizum);
    return ownOnly
      ? all.filter(
          s => 'playerId' in s.member && s.member.playerId === playerId
        )
      : all;
  }

  /** That many of another player's own shares, nearest first, checked. */
  private sharesForOther(
    bizum: StoredBizum['bizum'],
    payerId: number,
    other: SharesFor
  ): RulableShare[] {
    this.requirePlayer(other.playerId);
    if (other.playerId === payerId) {
      throw new BizumRefusal('Sus propias cuotas se eligen arriba');
    }
    if (!Number.isInteger(other.shares) || other.shares < 1) {
      throw new BizumRefusal('Indica cuántas cuotas paga por cada jugador');
    }
    const open = this.sharesOf(other.playerId, bizum, true);
    if (other.shares > open.length) {
      const name = this.players.nameOf(other.playerId) ?? '';
      throw new BizumRefusal(
        `${name} solo tiene ${open.length} cuota${open.length === 1 ? '' : 's'} abierta${open.length === 1 ? '' : 's'}`
      );
    }
    return open.slice(0, other.shares);
  }

  private paymentsOf(bizumId: number): SettledBizum['payments'] {
    const rows = this.conn
      .prepare(
        `SELECT p.id, p.game_id, g.played_on, p.amount_cents,
                p.beneficiary_player_id, p.holder_player_id
           FROM payments p JOIN games g ON g.id = p.game_id
          WHERE p.bizum_id = ? ORDER BY g.played_on, p.id`
      )
      .all(bizumId) as {
      id: number;
      game_id: number;
      played_on: string;
      amount_cents: number;
      beneficiary_player_id: number | null;
      holder_player_id: number;
    }[];
    return rows.map(row => {
      const holder = this.players.nameOf(row.holder_player_id) ?? '';
      return {
        paymentId: row.id,
        gameId: row.game_id,
        playedOn: row.played_on,
        playerName:
          row.beneficiary_player_id === null
            ? `Invitado de ${holder}`
            : (this.players.nameOf(row.beneficiary_player_id) ?? ''),
        amountCents: row.amount_cents,
      };
    });
  }

  private gamesPaidBy(bizumId: number): string[] {
    return (
      this.conn
        .prepare(
          `SELECT g.played_on FROM payments p JOIN games g ON g.id = p.game_id
           WHERE p.bizum_id = ? ORDER BY g.played_on`
        )
        .all(bizumId) as { played_on: string }[]
    ).map(row => row.played_on);
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
      return [
        {
          bizumId,
          status,
          bookedOn: stored.bizum.bookedOn,
          amountCents: stored.bizum.amountCents,
          games: this.gamesPaidBy(bizumId),
        },
      ];
    });
  }

  private laterGames(
    reason: WaitReason,
    bizum: StoredBizum['bizum']
  ): string[] {
    return reason.code === 'not_enough_debts'
      ? this.facts
          .laterSharesOf(reason.playerId, bizum)
          .map(share => share.playedOn)
      : [];
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
