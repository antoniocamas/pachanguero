import type Database from 'better-sqlite3';
import type { PlayerGameStat } from './player-game-stat.js';

export type PaymentValue =
  | {
      status: 'paid';
      amountCents: number;
      payerId: number;
      payerName: string;
      paidOn: string;
    }
  | {
      status: 'owed';
      amountCents: number;
      holderId: number;
      holderName: string;
    };

export interface PaymentSummary {
  paid: number;
  owed: number;
  owedCents: number;
}

/** Whether the player's own share of each game is settled or still owed. */
export class PaymentStat implements PlayerGameStat {
  readonly key = 'payment';

  constructor(private readonly conn: Database.Database) {}

  valuesFor(playerId: number): Map<number, PaymentValue> {
    const values = new Map<number, PaymentValue>();
    const owed = this.conn
      .prepare(
        `SELECT d.game_id AS gameId, d.amount_cents AS amountCents,
                d.holder_player_id AS holderId, h.name AS holderName
           FROM share_debts d JOIN players h ON h.id = d.holder_player_id
          WHERE d.beneficiary_player_id = ?`
      )
      .all(playerId) as Array<{
      gameId: number;
      amountCents: number;
      holderId: number;
      holderName: string;
    }>;
    for (const { gameId, ...rest } of owed)
      values.set(gameId, { status: 'owed', ...rest });
    const paid = this.conn
      .prepare(
        `SELECT p.game_id AS gameId, p.amount_cents AS amountCents,
                p.payer_player_id AS payerId, q.name AS payerName,
                p.paid_on AS paidOn
           FROM payments p JOIN players q ON q.id = p.payer_player_id
          WHERE p.beneficiary_player_id = ?`
      )
      .all(playerId) as Array<{
      gameId: number;
      amountCents: number;
      payerId: number;
      payerName: string;
      paidOn: string;
    }>;
    for (const { gameId, ...rest } of paid)
      values.set(gameId, { status: 'paid', ...rest });
    return values;
  }

  summarize(values: ReadonlyMap<number, unknown>): PaymentSummary {
    const summary: PaymentSummary = { paid: 0, owed: 0, owedCents: 0 };
    for (const v of values.values() as IterableIterator<PaymentValue>) {
      if (v.status === 'paid') summary.paid++;
      if (v.status === 'owed') {
        summary.owed++;
        summary.owedCents += v.amountCents;
      }
    }
    return summary;
  }
}
