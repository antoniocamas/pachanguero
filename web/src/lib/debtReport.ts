import type { OutstandingShare } from '../api';
import { fmtDate } from './dates';
import { euros } from './money';

export interface DebtFilter {
  gameId: number | null;
  holderId: number | null;
}

export interface Debtor {
  holderId: number;
  name: string;
  totalCents: number;
  shares: OutstandingShare[];
}

/** The shares that match both filters; a `null` filter lets everything in. */
export const filterShares = (
  shares: OutstandingShare[],
  { gameId, holderId }: DebtFilter
): OutstandingShare[] =>
  shares.filter(
    s =>
      (gameId === null || s.gameId === gameId) &&
      (holderId === null || s.holderId === holderId)
  );

/** Who owes, most first, each with their shares from the oldest game. */
export const groupByDebtor = (shares: OutstandingShare[]): Debtor[] => {
  const byHolder = new Map<number, Debtor>();
  for (const s of shares) {
    const debtor = byHolder.get(s.holderId) ?? {
      holderId: s.holderId,
      name: s.holderName,
      totalCents: 0,
      shares: [],
    };
    debtor.totalCents += s.amountCents;
    debtor.shares.push(s);
    byHolder.set(s.holderId, debtor);
  }
  return [...byHolder.values()].sort(
    (a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'es')
  );
};

export const totalCents = (shares: OutstandingShare[]): number =>
  shares.reduce((sum, s) => sum + s.amountCents, 0);

/** Whose share it is when it is not the holder's own: «por Luis», «+1». */
export const forWhom = (s: OutstandingShare): string | null => {
  if (s.beneficiaryId === s.holderId) return null;
  return s.beneficiaryName ?? '+1';
};

export const gameName = (s: OutstandingShare): string =>
  `${fmtDate(s.playedOn)}${s.gameLabel ? ` (${s.gameLabel})` : ''}`;

/** The games that still have debts, oldest first, for the game filter. */
export const gamesOwed = (
  shares: OutstandingShare[]
): Array<{ gameId: number; label: string }> => {
  const seen = new Map<number, string>();
  for (const s of shares)
    if (!seen.has(s.gameId)) seen.set(s.gameId, gameName(s));
  return [...seen].map(([gameId, label]) => ({ gameId, label }));
};

/** The people who owe, by name, for the person filter. */
export const peopleOwing = (
  shares: OutstandingShare[]
): Array<{ holderId: number; name: string }> =>
  groupByDebtor(shares)
    .map(({ holderId, name }) => ({ holderId, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

/** The message to paste into WhatsApp: *bold* is WhatsApp's own markup. */
export const whatsappText = (shares: OutstandingShare[]): string => {
  const lines = ['*Deudas del fútbol* ⚽'];
  for (const d of groupByDebtor(shares)) {
    lines.push('', `*${d.name}*`);
    for (const s of d.shares) {
      const who = forWhom(s);
      lines.push(
        `• ${gameName(s)}${who ? ` (${who})` : ''}: ${euros(s.amountCents)}`
      );
    }
    lines.push(`Total: ${euros(d.totalCents)}`);
  }
  return lines.join('\n');
};
