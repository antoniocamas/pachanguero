import type Database from 'better-sqlite3';
import { LocalCalendar } from '../domain/local-calendar.js';
import type { MemberKey } from '../domain/types.js';
import type { DebtRepository } from './debt-repository.js';
import type { GameLifecycleService } from './game-lifecycle-service.js';
import type { GameRepository } from './game-repository.js';
import type { PaymentRepository, PaymentRow } from './payment-repository.js';
import type { ParticipationRepository } from './participation-repository.js';
import { ShareRowMember } from './share-rows.js';
import type { PlayerRepository } from './player-repository.js';
import type { SeasonRepository } from './season-repository.js';

export interface PayRequest {
  shares: MemberKey[];
  payerPlayerId: number;
  /** Only with a single share: an odd amount is an adjustment, not a balance. */
  amountCents?: number;
  paidOn?: string;
}

/**
 * Settles shares: the holder or the beneficiary pays, a debt becomes a payment,
 * and the beneficiary's own paid game follows. Everything of one request
 * happens or nothing does.
 */
export class PaymentService {
  private readonly calendar = new LocalCalendar();
  private readonly members = new ShareRowMember();

  constructor(
    private readonly games: GameRepository,
    private readonly lifecycle: GameLifecycleService,
    private readonly debts: DebtRepository,
    private readonly payments: PaymentRepository,
    private readonly participations: ParticipationRepository,
    private readonly players: PlayerRepository,
    private readonly seasons: SeasonRepository,
    private readonly conn: Database.Database
  ) {}

  pay(
    gameId: number,
    request: PayRequest,
    now: Date = new Date()
  ): PaymentRow[] {
    this.lifecycle.require(gameId, 'pay');
    if (request.shares.length === 0) throw new Error('No hay nada que pagar');
    if (request.amountCents !== undefined) {
      if (request.shares.length !== 1)
        throw new Error('Solo se puede ajustar el importe de una parte');
      if (!Number.isInteger(request.amountCents) || request.amountCents <= 0)
        throw new Error('El importe debe ser mayor que cero');
    }
    const paidOn = request.paidOn ?? this.calendar.dateOf(now);
    return this.conn.transaction(() =>
      request.shares.map(member => this.settle(gameId, member, request, paidOn))
    )();
  }

  /** Put a payment back as the debt it settled. Only while the game is played. */
  undo(gameId: number, paymentId: number): void {
    this.lifecycle.require(gameId, 'pay');
    const payment = this.payments.find(paymentId);
    if (!payment || payment.game_id !== gameId)
      throw new Error('Ese pago no es de este partido');
    const seasonId = this.games.get(gameId)!.season_id;
    this.conn.transaction(() => {
      this.payments.delete(paymentId);
      const member = this.members.keyOf(payment);
      this.debts.insert(
        gameId,
        member,
        payment.holder_player_id,
        this.seasons.shareCents(seasonId)
      );
      if ('playerId' in member)
        this.participations.set(gameId, member.playerId, {
          paid_cents: 0,
          paid_on: null,
        });
    })();
  }

  private settle(
    gameId: number,
    member: MemberKey,
    request: PayRequest,
    paidOn: string
  ): PaymentRow {
    const debt = this.debts.find(gameId, member);
    if (!debt) {
      throw new Error(
        this.payments.findByMember(gameId, member)
          ? `${this.nameOf(member)} ya está pagado`
          : `${this.nameOf(member)} no estaba en la convocatoria`
      );
    }
    const beneficiary = 'playerId' in member ? member.playerId : null;
    if (
      request.payerPlayerId !== debt.holder_player_id &&
      request.payerPlayerId !== beneficiary
    )
      throw new Error('Solo puede pagar quien lo debe o a quien corresponde');

    const amountCents = request.amountCents ?? debt.amount_cents;
    this.debts.delete(debt.id);
    const payment = this.payments.append({
      gameId,
      member,
      holderId: debt.holder_player_id,
      payerId: request.payerPlayerId,
      amountCents,
      paidOn,
    });
    if (beneficiary !== null)
      this.participations.set(gameId, beneficiary, {
        paid_cents: amountCents,
        paid_on: paidOn,
      });
    return payment;
  }

  private nameOf(member: MemberKey): string {
    return 'playerId' in member
      ? (this.players.nameOf(member.playerId) ?? `Jugador ${member.playerId}`)
      : `Invitado de ${this.players.nameOf(member.hostPlayerId) ?? member.hostPlayerId}`;
  }
}
