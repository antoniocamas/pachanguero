import type { RulableShare } from '../api';
import { fmtDate } from './dates';
import { euros } from './money';

/**
 * The most shares a ruling can pay: as many of the nearest open shares as the Bizum's money
 * covers. It never pays shares worth more than the Bizum.
 */
export const maxShares = (
  open: readonly RulableShare[],
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
  paid: RulableShare[];
  restCents: number;
  /** The sentence that says it. */
  text: string;
}

const gameDays = (paid: readonly RulableShare[]) =>
  paid.map(share => fmtDate(share.playedOn).replace(/^\S+,\s*/, ''));

export const rulingPreview = (
  open: readonly RulableShare[],
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
  const later = paid.filter(share => share.afterBooking).length;
  const afterBooking =
    later === 0
      ? ''
      : ` Entre ellas, ${later} de ${later === 1 ? 'un partido posterior' : 'partidos posteriores'} a la fecha del Bizum.`;
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
        : `${settles}${afterBooking}${rest} Solo se pagan deudas de la misma temporada que el Bizum.`,
  };
};

/** `1 cuota (4 €)` or `2 cuotas (8 €)`: the shares chosen and what they come to. */
export const sharesLabel = (open: readonly RulableShare[], shares: number) => {
  const cents = open.slice(0, shares).reduce((s, p) => s + p.amountCents, 0);
  return `${shares === 1 ? '1 cuota' : `${shares} cuotas`} (${euros(cents)})`;
};

/**
 * The shares a ruling starts from: as many as the Bizum is when the rules counted them, as far as
 * the debts and the money go; one otherwise.
 */
export const defaultShares = (
  wanted: number | null,
  open: readonly RulableShare[],
  amountCents: number
): number =>
  wanted === null
    ? 1
    : Math.max(1, Math.min(wanted, maxShares(open, amountCents)));
