import type { PaymentMethod } from '../domain/payment-method.js';
import type { BizumStore } from '../bizum/ports.js';
import type { BizumHandlingRepository } from './bizum-handling-repository.js';
import type { GameRepository } from './game-repository.js';
import type { PaymentRepository, PaymentRow } from './payment-repository.js';
import type { PlayerRepository } from './player-repository.js';

export interface PaymentDetail {
  payment: {
    id: number;
    gameId: number;
    playedOn: string;
    amountCents: number;
    paidOn: string;
    method: PaymentMethod;
    payerName: string;
    beneficiaryName: string | null;
  };
  /** How it was settled; every payment without a Bizum was made by hand, whatever its method. */
  resolved: 'manual' | 'automatic' | 'organiser';
  bizum: null | {
    bookedOn: string;
    sender: { name: string | null; phone: string | null };
    amountCents: number;
    currency: string;
    subject: string | null;
    /** The bank's own identification of the entry. */
    reference: string;
    unallocatedCents: number;
    payments: {
      id: number;
      gameId: number;
      playedOn: string;
      beneficiaryName: string | null;
      amountCents: number;
    }[];
  };
}

/** What the organiser may know about how a payment was made, and the Bizum behind it. Reads only. */
export class PaymentDetailService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly games: GameRepository,
    private readonly players: PlayerRepository,
    private readonly store: BizumStore,
    private readonly handling: BizumHandlingRepository
  ) {}

  detail(paymentId: number): PaymentDetail {
    const payment = this.payments.find(paymentId);
    if (!payment) throw new Error('No existe ese pago');
    const base = {
      payment: {
        ...this.line(payment),
        paidOn: payment.paid_on,
        method: payment.method,
        payerName: this.players.nameOf(payment.payer_player_id) ?? '',
      },
    };
    const stored =
      payment.bizum_id === null ? null : this.store.find(payment.bizum_id);
    if (payment.bizum_id === null || stored === null) {
      return { ...base, resolved: 'manual', bizum: null };
    }
    const handling = this.handling.get(payment.bizum_id);
    const { bizum } = stored;
    return {
      ...base,
      resolved: handling?.settledHow ?? 'automatic',
      bizum: {
        bookedOn: bizum.bookedOn,
        sender: { name: bizum.sender.name, phone: bizum.sender.phone },
        amountCents: bizum.amountCents,
        currency: bizum.currency,
        subject: bizum.subject,
        reference: bizum.key.reference,
        unallocatedCents: handling?.unallocatedCents ?? 0,
        payments: this.payments
          .byBizum(payment.bizum_id)
          .map(each => this.line(each)),
      },
    };
  }

  private line(payment: PaymentRow) {
    return {
      id: payment.id,
      gameId: payment.game_id,
      playedOn: this.games.get(payment.game_id)?.played_on ?? '',
      beneficiaryName:
        payment.beneficiary_player_id === null
          ? null
          : (this.players.nameOf(payment.beneficiary_player_id) ?? null),
      amountCents: payment.amount_cents,
    };
  }
}
