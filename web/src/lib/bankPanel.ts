import type { BankAccount, BankBanner, BankPanel, LastRead } from '../api';
import { failureText } from './bankMessages';
import { fmtFullDate, fmtTime } from './dates';

const KINDS: Record<string, string> = {
  CACC: 'Corriente',
  SVGS: 'Ahorro',
  CARD: 'Tarjeta',
};

/** `Corriente · EUR ··· 4821`: all the organiser is told of an account. */
export const accountLabel = (
  account: Pick<BankAccount, 'kind' | 'currency' | 'last4'>
) =>
  `${KINDS[account.kind] ?? (account.kind || 'Cuenta')} · ${account.currency} ··· ${account.last4}`;

/** The name of the bank read, from the server's list; a bank the list lost has none. */
export const bankName = (panel: BankPanel): string | null =>
  panel.bank.options.find(option => option.id === panel.bank.chosenId)
    ?.displayName ?? null;

/** `Sin conexión`, `Conectado · <banco>` or `Reconexión necesaria`. */
export const stateLabel = (panel: BankPanel) => {
  if (panel.connection === null) return 'Sin conexión';
  return panel.connection.state === 'connected'
    ? `Conectado · ${bankName(panel) ?? 'banco'}`
    : 'Reconexión necesaria';
};

export const daysLeftText = (days: number) => {
  if (days <= 0) return 'caduca hoy';
  return days === 1 ? '1 día restante' : `${days} días restantes`;
};

/** `30/03/2027 · 10 días restantes`. */
export const expiryText = (validUntil: string, daysLeft: number) =>
  `${fmtFullDate(validUntil)} · ${daysLeftText(daysLeft)}`;

/** What the connection card offers: which buttons, and which one leads. */
export interface ConnectionButtons {
  connect: { label: string; disabled: boolean } | null;
  renew: { primary: boolean } | null;
  disconnect: boolean;
}

export const connectionButtons = (panel: BankPanel): ConnectionButtons => {
  const connection = panel.connection;
  if (connection?.state === 'connected') {
    return {
      connect: null,
      renew: { primary: connection.renewSuggested },
      disconnect: true,
    };
  }
  return {
    connect: {
      label: `Conectar con ${bankName(panel) ?? 'el banco'}`,
      disabled: !panel.canConnect,
    },
    renew: null,
    disconnect: connection !== null,
  };
};

/** `hoy 07:30 · correcta`, `ayer 07:30 · el banco pidió esperar`, or the date for an older one. */
export const lastReadText = (last: LastRead, now: Date): string => {
  const finished = new Date(last.finishedAt);
  const day = (date: Date) => date.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const when =
    day(finished) === day(now)
      ? 'hoy'
      : day(finished) === day(yesterday)
        ? 'ayer'
        : fmtFullDate(last.finishedAt);
  const result =
    last.result === 'ok' ? 'correcta' : failureText(last.result, last.code);
  return `${when} ${fmtTime(last.finishedAt)} · ${result}`;
};

/** The strip above the tabs, or null when nothing needs the organiser. */
export const bannerText = (banner: BankBanner): string | null => {
  if (!banner.show) return null;
  if (banner.state === 'reconnect_needed') {
    return 'La conexión con el banco ya no es válida. Los pagos a mano siguen funcionando.';
  }
  const days = banner.daysLeft ?? 0;
  if (days <= 0) return 'La conexión con el banco caduca hoy.';
  return days === 1
    ? 'La conexión con el banco caduca mañana.'
    : `La conexión con el banco caduca en ${days} días.`;
};

/** The accounts in the currency to read, which are the ones to choose from. */
export const accountsToChoose = (panel: BankPanel) =>
  panel.accounts.filter(
    account => account.currency.toUpperCase() === panel.currency.toUpperCase()
  );

/** Both lists after adding a word; a blank or repeated one changes nothing. */
export const withWord = (list: readonly string[], word: string): string[] => {
  const trimmed = word.trim();
  return trimmed === '' || list.includes(trimmed)
    ? [...list]
    : [...list, trimmed];
};

export const withoutWord = (list: readonly string[], word: string): string[] =>
  list.filter(each => each !== word);
