import type { SettledBizum } from '../api';
import { fmtDate } from './dates';
import { euros } from './money';
import { senderText, settledHowText } from './waitingBizums';

export type SettledSort = 'newest' | 'oldest';
export type SettledHow = SettledBizum['settledHow'];
export interface SettledFilter {
  /** Words that must all appear somewhere in the Bizum: sender, player, subject, date, amount… */
  text: string;
  how: SettledHow | 'all';
}

/** Lowercase and without accents, so «Joaquin» finds «Joaquín». */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** `12/10` and `12/10/2026` for an ISO day. */
const dayForms = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return [`${day}/${month}`, `${day}/${month}/${year}`, iso, fmtDate(iso)];
};

/** The players a Bizum paid for, each once, in the order of their games. */
export const paidPlayers = (item: SettledBizum): string[] => [
  ...new Set(item.payments.map(p => p.playerName)),
];

/** Everything a search can match in a settled Bizum, as one plain string. */
export const searchableText = (item: SettledBizum): string =>
  plain(
    [
      senderText(item.sender),
      item.sender.phone ?? '',
      item.subject ?? '',
      settledHowText(item.settledHow),
      euros(item.amountCents),
      (item.amountCents / 100).toFixed(2).replace('.', ','),
      ...dayForms(item.bookedOn),
      ...item.payments.flatMap(p => [p.playerName, ...dayForms(p.playedOn)]),
    ].join(' ')
  );

/** The Bizums that match every word of the search and the way they were settled. */
export const filterSettled = (
  items: readonly SettledBizum[],
  filter: SettledFilter
): SettledBizum[] => {
  const words = plain(filter.text).split(/\s+/).filter(Boolean);
  return items.filter(
    item =>
      (filter.how === 'all' || item.settledHow === filter.how) &&
      words.every(word => searchableText(item).includes(word))
  );
};

/** By booking date; the same day keeps the order the server gave. */
export const sortSettled = (
  items: readonly SettledBizum[],
  sort: SettledSort
): SettledBizum[] =>
  [...items].sort((a, b) =>
    sort === 'newest'
      ? b.bookedOn.localeCompare(a.bookedOn)
      : a.bookedOn.localeCompare(b.bookedOn)
  );

/** `octubre de 2026`, the heading of the Bizums booked in that month. */
export const monthHeading = (iso: string): string =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  });

/** Consecutive Bizums of the same month, under that month's heading. */
export const groupByMonth = (
  items: readonly SettledBizum[]
): { heading: string; items: SettledBizum[] }[] => {
  const groups: { heading: string; items: SettledBizum[] }[] = [];
  for (const item of items) {
    const heading = monthHeading(item.bookedOn);
    const last = groups[groups.length - 1];
    if (last?.heading === heading) last.items.push(item);
    else groups.push({ heading, items: [item] });
  }
  return groups;
};
