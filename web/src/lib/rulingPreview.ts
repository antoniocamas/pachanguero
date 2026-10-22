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
  paid.map(share => {
    const day = fmtDate(share.playedOn).replace(/^\S+,\s*/, '');
    if (share.afterBooking) return `${day} (posterior al Bizum)`;
    return share.previousSeason ? `${day} (de una temporada anterior)` : day;
  });

export const rulingPreview = (
  open: readonly RulableShare[],
  amountCents: number,
  shares: number
): RulingPreview => {
  const paid = open.slice(0, shares);
  const restCents = amountCents - paid.reduce((s, p) => s + p.amountCents, 0);
  const days = gameDays(paid);
  const listed = days.map(day => `del ${day}`);
  const text =
    paid.length === 0
      ? open.length === 0
        ? 'No hay deudas que pagar.'
        : 'Marca las cuotas que paga este Bizum; si no marcas ninguna, sigue en espera.'
      : paid.length === 1
        ? `Se liquidará la deuda del ${days[0]}.`
        : `Se liquidarán las deudas ${listed.slice(0, -1).join(', ')} y ${listed[listed.length - 1]}.`;
  return { paid, restCents, text };
};
/**
 * The shares a ruling starts from: as many as the Bizum is when the rules counted them (one
 * otherwise), as far as the money goes and only among the games up to the Bizum's date. A later
 * game or a previous season's is never where a ruling starts: the organiser adds it.
 */
export const defaultShares = (
  wanted: number | null,
  open: readonly RulableShare[],
  amountCents: number
): number => {
  const upToBooking = open.findIndex(
    share => share.afterBooking || share.previousSeason
  );
  const available = upToBooking === -1 ? open.length : upToBooking;
  return Math.min(wanted ?? 1, maxShares(open, amountCents), available);
};

/** One debt in the dialog: its text, whether it is ticked and whether the Bizum can pay it. */
export interface ShareRow {
  share: RulableShare;
  text: string;
  checked: boolean;
  payable: boolean;
}

/** Every open debt in the order a Bizum pays them, ticked up to `count`. */
export const shareRows = (
  open: readonly RulableShare[],
  amountCents: number,
  count: number
): ShareRow[] => {
  const most = maxShares(open, amountCents);
  return open.map((share, i) => {
    const day = fmtDate(share.playedOn).replace(/^\S+,\s*/, '');
    const mark = share.afterBooking
      ? ' · posterior al Bizum'
      : share.previousSeason
        ? ' · de una temporada anterior'
        : '';
    return {
      share,
      text: `${day} · ${euros(share.amountCents)}${mark}`,
      checked: i < count,
      payable: i < most,
    };
  });
};

/** The count after ticking or unticking the debt at `index`: a Bizum pays in order. */
export const sharesAfterToggle = (
  count: number,
  index: number,
  checked: boolean
): number => (checked ? index + 1 : index);

/** The money the first `count` shares take. */
export const centsOf = (open: readonly RulableShare[], count: number): number =>
  open.slice(0, count).reduce((sum, share) => sum + share.amountCents, 0);

/** The shares a ruling pays for each other player, as a sentence; null when it pays for none. */
export const othersText = (
  picked: readonly { name: string; count: number }[]
): string | null => {
  const named = picked
    .filter(p => p.count > 0)
    .map(p => `${p.name} (${p.count === 1 ? '1 cuota' : `${p.count} cuotas`})`);
  if (named.length === 0) return null;
  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(', ')} y ${named[named.length - 1]}`;
  return `Paga también por ${list}.`;
};
