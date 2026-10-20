import type { OpenShare } from '../api';
import { fmtDate } from './dates';
import { euros } from './money';

/**
 * The most shares a ruling can pay: as many of the nearest open shares as the Bizum's money
 * covers. It never pays shares worth more than the Bizum.
 */
export const maxShares = (
  open: readonly OpenShare[],
  amountCents: number
): number => {
  let sum = 0;
  let count = 0;
  for (const share of open) {
    sum += share.amountCents;
    if (sum > amountCents) break;
    count++;
  }
  return count;
};

/** What paying `shares` of the open shares would do, before the organiser decides. */
export interface RulingPreview {
  /** The debts it settles, nearest first. */
  paid: OpenShare[];
  restCents: number;
  /** The sentence that says it. */
  text: string;
}

const gameDays = (paid: readonly OpenShare[]) =>
  paid.map(share => fmtDate(share.playedOn).replace(/^\S+,\s*/, ''));

export const rulingPreview = (
  open: readonly OpenShare[],
  amountCents: number,
  shares: number
): RulingPreview => {
  const paid = open.slice(0, shares);
  const restCents = amountCents - paid.reduce((s, p) => s + p.amountCents, 0);
  const days = gameDays(paid);
  const settles =
    paid.length === 1
      ? `Se liquidará la deuda del ${days[0]}.`
      : `Se liquidarán las deudas del ${days.slice(0, -1).join(', ')} y del ${days[days.length - 1]}.`;
  const rest =
    restCents > 0
      ? ` Quedarán ${euros(restCents)} sin asignar en el Bizum.`
      : '';
  return {
    paid,
    restCents,
    text:
      paid.length === 0
        ? 'No hay deudas que pagar.'
        : `${settles}${rest} Solo se pagan deudas de la misma temporada que el Bizum.`,
  };
};

/** `1 cuota (4 €)` or `2 cuotas (8 €)`: the shares chosen and what they come to. */
export const sharesLabel = (open: readonly OpenShare[], shares: number) => {
  const cents = open.slice(0, shares).reduce((s, p) => s + p.amountCents, 0);
  return `${shares === 1 ? '1 cuota' : `${shares} cuotas`} (${euros(cents)})`;
};
