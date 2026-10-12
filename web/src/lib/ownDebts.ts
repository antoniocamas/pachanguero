import type { HeldRow, OwnDebtRow, OwnPaymentRow } from '../api';
import { fmtDate } from './dates';
import { euros } from './money';
import type { SessionUser } from './sessionClient';

/** One line of a list the player reads: the date, an optional game label, an amount and a tag. */
export interface MoneyLine {
  key: string;
  date: string;
  label: string | null;
  amount: string;
  tag: string | null;
}

/** What the player owes, as lines: their own share or "invitado". */
export const debtLines = (rows: readonly OwnDebtRow[]): MoneyLine[] =>
  rows.map((r, i) => ({
    key: `${r.gameId}-${i}`,
    date: fmtDate(r.playedOn),
    label: r.label,
    amount: euros(r.amountCents),
    tag: r.kind === 'own' ? 'tu parte' : 'invitado',
  }));

/** The shares another player pays for this one: they do not add to what is owed. */
export const heldLines = (rows: readonly HeldRow[]): MoneyLine[] =>
  rows.map((r, i) => ({
    key: `${r.gameId}-${i}`,
    date: fmtDate(r.playedOn),
    label: r.label,
    amount: euros(r.amountCents),
    tag: `lo paga ${r.holderName}`,
  }));

const paidByNote = (paidBy: OwnPaymentRow['paidBy']): string | null => {
  if (paidBy === null) return null;
  return paidBy === 'other'
    ? 'pagado por otra persona'
    : `pagado por ${paidBy.name}`;
};

/** What was paid by or for the player, as lines (the server already ordered them). */
export const paymentLines = (rows: readonly OwnPaymentRow[]): MoneyLine[] =>
  rows.map((r, i) => ({
    key: `${r.gameId}-${i}`,
    date: `${fmtDate(r.playedOn)} · pagado el ${fmtDate(r.paidOn)}`,
    label: r.label,
    amount: euros(r.amountCents),
    tag: paidByNote(r.paidBy) ?? (r.kind === 'guest' ? 'invitado' : null),
  }));

/** What the account settings offer about the admin's player view. */
export type ViewSwitchAction =
  | {
      kind: 'switch';
      to: 'admin' | 'regular';
      label: string;
      hint: string | null;
    }
  | { kind: 'unavailable'; note: string };

/** The view switch to show for this user, or nothing when it is not theirs to have. */
export const viewSwitchAction = (
  user: SessionUser
): ViewSwitchAction | null => {
  if (user.role !== 'admin') return null;
  if (user.mode === 'regular') {
    return {
      kind: 'switch',
      to: 'admin',
      label: 'Volver a administrador',
      hint: null,
    };
  }
  if (!user.canSwitchView) {
    return {
      kind: 'unavailable',
      note: 'Tu usuario no está asociado a ningún jugador, así que no hay vista de jugador.',
    };
  }
  return {
    kind: 'switch',
    to: 'regular',
    label: 'Ver como jugador',
    hint: `Ves la aplicación exactamente como la ve tu jugador (${user.playerName}): deudas, pagos, estadísticas y tus datos. Para volver pulsa «Volver a administrador» en Ajustes. No se pide contraseña.`,
  };
};
