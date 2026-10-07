import type { Debt, MemberKey, Payment } from '../api';
import type { GameRow } from './gameRows';
import { debtOf, heldBy } from './holdings';
import { euros } from './money';
import { keyOf, memberOf } from './shares';

/** One thing the payment cell of a row offers or says. */
export type PaymentPart =
  /** Settle these shares, handed over by `payerId`. */
  | { kind: 'pay'; label: string; shares: MemberKey[]; payerId: number }
  /** Settle a single share with an amount of the organiser's choosing. */
  | { kind: 'adjust'; share: MemberKey; payerId: number }
  /** Whose debt a share of this row is, when it is not their own. */
  | { kind: 'tag'; label: string }
  /** A settled share, which can be undone. */
  | { kind: 'paid'; label: string; paymentId: number };

/**
 * What a row's payment cell shows. A holder's button pays everything they
 * hold; a beneficiary pays their own share and the tag says whose debt it was;
 * a settled share says how much, and by whom when it was not the beneficiary.
 */
export const paymentCell = (
  row: GameRow,
  debts: readonly Debt[],
  payments: readonly Payment[],
  names: ReadonlyMap<number, string>
): PaymentPart[] => {
  const nameOf = (id: number) => names.get(id) ?? `Jugador ${id}`;
  const parts: PaymentPart[] = [];
  const ownDebt = debtOf(debts, row.key);
  const ownPayment = payments.find(p => keyOf(memberOf(p)) === row.id);

  if (ownPayment) {
    const beneficiary = row.playerId ?? ownPayment.holder_player_id;
    const by =
      ownPayment.payer_player_id === beneficiary
        ? ''
        : ` por ${nameOf(ownPayment.payer_player_id)}`;
    parts.push({
      kind: 'paid',
      label: `Pagado ${euros(ownPayment.amount_cents)}${by}`,
      paymentId: ownPayment.id,
    });
  }

  if (row.playerId === null) {
    if (ownDebt)
      parts.push(...settleOne(row.key, ownDebt, ownDebt.holder_player_id));
    return parts;
  }

  const playerId = row.playerId;
  const heldByRow = heldBy(debts, playerId);
  const ownIsHeldByRow = ownDebt?.holder_player_id === playerId;

  if (ownDebt && !ownIsHeldByRow) {
    parts.push({
      kind: 'tag',
      label: `Deuda de ${nameOf(ownDebt.holder_player_id)}`,
    });
    parts.push(...settleOne(row.key, ownDebt, playerId));
  }

  if (heldByRow.length > 0) {
    const total = heldByRow.reduce((sum, d) => sum + d.amount_cents, 0);
    parts.push({
      kind: 'pay',
      label: `Pagar ${euros(total)}`,
      shares: heldByRow.map(memberOf),
      payerId: playerId,
    });
    if (ownDebt && ownIsHeldByRow && heldByRow.length > 1) {
      parts.push({
        kind: 'pay',
        label: `Solo lo suyo ${euros(ownDebt.amount_cents)}`,
        shares: [row.key],
        payerId: playerId,
      });
    }
    if (ownDebt && ownIsHeldByRow && heldByRow.length === 1) {
      parts.push({ kind: 'adjust', share: row.key, payerId: playerId });
    }
  }
  return parts;
};

/** Pay one share in full, or with another amount. */
const settleOne = (
  share: MemberKey,
  debt: Debt,
  payerId: number
): PaymentPart[] => [
  {
    kind: 'pay',
    label: `Pagar ${euros(debt.amount_cents)}`,
    shares: [share],
    payerId,
  },
  { kind: 'adjust', share, payerId },
];
