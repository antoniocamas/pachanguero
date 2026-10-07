import type Database from 'better-sqlite3';
import type { MemberKey } from '../domain/types.js';
import { ShareKey } from '../domain/share-key.js';
import { ShareRowMember, type ShareRow } from './share-rows.js';

export interface PaymentRow extends ShareRow {
  id: number;
  payer_player_id: number;
  paid_on: string;
}

/** Shares settled: who paid each, how much and when. Append-only except for undo. */
export class PaymentRepository {
  private readonly members = new ShareRowMember();

  constructor(private readonly conn: Database.Database) {}

  list(gameId: number): PaymentRow[] {
    return this.conn
      .prepare('SELECT * FROM payments WHERE game_id = ? ORDER BY id')
      .all(gameId) as PaymentRow[];
  }

  find(paymentId: number): PaymentRow | null {
    return (
      (this.conn
        .prepare('SELECT * FROM payments WHERE id = ?')
        .get(paymentId) as PaymentRow | undefined) ?? null
    );
  }

  findByMember(gameId: number, member: MemberKey): PaymentRow | null {
    const [beneficiary, ordinal] = this.members.columnsOf(member);
    const holder = 'hostPlayerId' in member ? member.hostPlayerId : null;
    return (
      (this.conn
        .prepare(
          `SELECT * FROM payments
            WHERE game_id = @gameId
              AND ((@beneficiary IS NOT NULL AND beneficiary_player_id = @beneficiary)
                OR (@ordinal IS NOT NULL AND guest_ordinal = @ordinal
                    AND holder_player_id = @holder))`
        )
        .get({ gameId, beneficiary, ordinal, holder }) as
        PaymentRow | undefined) ?? null
    );
  }

  append(payment: {
    gameId: number;
    member: MemberKey;
    holderId: number;
    payerId: number;
    amountCents: number;
    paidOn: string;
  }): PaymentRow {
    const [beneficiary, ordinal] = this.members.columnsOf(payment.member);
    const info = this.conn
      .prepare(
        `INSERT INTO payments
           (game_id, holder_player_id, beneficiary_player_id, guest_ordinal,
            payer_player_id, amount_cents, paid_on)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        payment.gameId,
        payment.holderId,
        beneficiary,
        ordinal,
        payment.payerId,
        payment.amountCents,
        payment.paidOn
      );
    return this.find(Number(info.lastInsertRowid))!;
  }

  delete(paymentId: number): void {
    this.conn.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);
  }

  keysOf(gameId: number): string[] {
    return this.list(gameId).map(p =>
      new ShareKey(this.members.keyOf(p)).toString()
    );
  }
}
