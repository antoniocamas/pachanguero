import type Database from 'better-sqlite3';
import type { PaymentMethod } from '../domain/payment-method.js';
import { LocalCalendar } from '../domain/local-calendar.js';
import type { MemberKey } from '../domain/types.js';
import type { GameLifecycleService } from './game-lifecycle-service.js';
import type { PaymentRepository, PaymentRow } from './payment-repository.js';
import type { ShareSettler } from './share-settler.js';

export interface PayRequest {
  shares: MemberKey[];
  payerPlayerId: number;
  /** Only with a single share: an odd amount is an adjustment, not a balance. */
  amountCents?: number;
  paidOn?: string;
  method: PaymentMethod;
}

/**
 * Settles shares: the holder or the beneficiary pays, a debt becomes a payment,
 * and the beneficiary's own paid game follows. Everything of one request
 * happens or nothing does.
 */
export class PaymentService {
  private readonly calendar = new LocalCalendar();

  constructor(
    private readonly lifecycle: GameLifecycleService,
    private readonly payments: PaymentRepository,
    private readonly settler: ShareSettler,
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
      request.shares.map(member =>
        this.settler.settle(gameId, member, {
          payerPlayerId: request.payerPlayerId,
          amountCents: request.amountCents,
          paidOn,
          method: request.method,
        })
      )
    )();
  }

  /** Put a payment back as the debt it settled. Only while the game is played. */
  undo(gameId: number, paymentId: number): void {
    this.lifecycle.require(gameId, 'pay');
    const payment = this.payments.find(paymentId);
    if (!payment || payment.game_id !== gameId)
      throw new Error('Ese pago no es de este partido');
    this.conn.transaction(() => this.settler.unsettle(payment))();
  }
}
