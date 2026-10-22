import type { PaymentMethod } from '../domain/payment-method.js';
import type { MemberKey } from '../domain/types.js';
import type { DebtRepository } from './debt-repository.js';
import type { GameRepository } from './game-repository.js';
import type { PaymentRepository, PaymentRow } from './payment-repository.js';
import type { ParticipationRepository } from './participation-repository.js';
import type { PlayerRepository } from './player-repository.js';
import type { SeasonRepository } from './season-repository.js';
import { ShareRowMember } from './share-rows.js';

export interface Settlement {
  payerPlayerId: number;
  /** An adjusted amount; absent, the debt's own amount is paid. */
  amountCents?: number;
  paidOn: string;
  method: PaymentMethod;
  /** The Bizum that pays it, when one does. */
  bizumId?: number;
  /**
   * The organiser ruled that this payer pays the share although it is neither theirs nor one
   * they answer for: someone paying for another player. The share keeps its holder.
   */
  onBehalf?: boolean;
}

/**
 * Moves one share between the debts and the payments, keeping the beneficiary's
 * paid game in step. The caller holds the transaction and has established that the
 * game takes payments; this class checks neither.
 */
export class ShareSettler {
  private readonly members = new ShareRowMember();

  constructor(
    private readonly games: GameRepository,
    private readonly debts: DebtRepository,
    private readonly payments: PaymentRepository,
    private readonly participations: ParticipationRepository,
    private readonly players: PlayerRepository,
    private readonly seasons: SeasonRepository
  ) {}

  settle(
    gameId: number,
    member: MemberKey,
    settlement: Settlement
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
      !settlement.onBehalf &&
      settlement.payerPlayerId !== debt.holder_player_id &&
      settlement.payerPlayerId !== beneficiary
    )
      throw new Error('Solo puede pagar quien lo debe o a quien corresponde');

    const amountCents = settlement.amountCents ?? debt.amount_cents;
    this.debts.delete(debt.id);
    const payment = this.payments.append({
      gameId,
      member,
      holderId: debt.holder_player_id,
      payerId: settlement.payerPlayerId,
      amountCents,
      paidOn: settlement.paidOn,
      method: settlement.method,
      bizumId: settlement.bizumId,
    });
    if (beneficiary !== null)
      this.participations.set(gameId, beneficiary, {
        paid_cents: amountCents,
        paid_on: settlement.paidOn,
      });
    return payment;
  }

  /** Put a payment back as the debt it settled. */
  unsettle(payment: PaymentRow): void {
    const gameId = payment.game_id;
    const seasonId = this.games.get(gameId)!.season_id;
    this.payments.delete(payment.id);
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
  }

  private nameOf(member: MemberKey): string {
    return 'playerId' in member
      ? (this.players.nameOf(member.playerId) ?? `Jugador ${member.playerId}`)
      : `Invitado de ${this.players.nameOf(member.hostPlayerId) ?? member.hostPlayerId}`;
  }
}
