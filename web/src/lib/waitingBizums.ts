import type { PairResult, WaitingBizum } from '../api';
import { fmtDate } from './dates';
import { euros } from './money';

/** `a`, `a o b`, `a, b o c`. */
const orList = (names: readonly string[]) =>
  names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} o ${names[names.length - 1]}`;

/** `a`, `a y b`, `a, b y c`. */
const andList = (items: readonly string[]) =>
  items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;

/** `28 sept`: a game's day without the weekday. */
const gameDay = (iso: string) => fmtDate(iso).replace(/^\S+,\s*/, '');

const nameOf = (item: WaitingBizum, playerId: number) =>
  item.players[playerId] ?? `Jugador ${playerId}`;

const shares = (n: number) => (n === 1 ? '1 cuota' : `${n} cuotas`);

/** The sender as the bank showed it. */
export const senderText = (sender: WaitingBizum['sender']) =>
  sender.name ?? sender.phone ?? 'Remitente sin nombre';

/** `12/10 · «pachanga»`, or `12/10 · sin asunto`. */
export const bookedText = (item: WaitingBizum) => {
  const [, month, day] = item.bookedOn.split('-');
  return `${day}/${month} · ${item.subject === null ? 'sin asunto' : `«${item.subject}»`}`;
};

export const amountText = (item: WaitingBizum) => euros(item.amountCents);

/** `= Luis Pérez` when the sender is a player; otherwise null. */
export const identifiedAs = (item: WaitingBizum): string | null =>
  item.senderIdentity.kind === 'player'
    ? `= ${nameOf(item, item.senderIdentity.playerId)}`
    : null;

/** Why the Bizum waits, one line each; a reason the app does not know is "Revisa este Bizum.". */
export const reasonLines = (item: WaitingBizum): string[] => {
  const { reason, senderIdentity } = item;
  switch (reason.code) {
    case 'not_enough_debts':
      return [
        `${nameOf(item, reason.playerId)} debe ${shares(reason.debts)} y el Bizum son ${reason.shares}.`,
        ...(item.laterGames.length > 0
          ? [
              `Debe ${shares(item.laterGames.length)} de partidos posteriores al Bizum: ${andList(item.laterGames.map(gameDay))}.`,
            ]
          : []),
      ];
    case 'include_word':
      return [
        reason.wholeShares
          ? `El asunto menciona ${reason.word}.`
          : `El importe no es un número de cuotas, pero el asunto menciona ${reason.word}.`,
      ];
    case 'sender_unknown': {
      const suggested =
        senderIdentity.kind === 'unknown'
          ? senderIdentity.suggestions.map(id => nameOf(item, id))
          : [];
      return [
        'No sabemos quién es el remitente.',
        ...(suggested.length > 0 ? [`¿Es ${orList(suggested)}?`] : []),
      ];
    }
    case 'sender_ambiguous':
      return [
        `Puede ser ${orList(reason.playerIds.map(id => nameOf(item, id)))}.`,
      ];
    case 'no_season':
      return ['No existe la temporada de esa fecha.'];
    case 'undone':
      return ['Se deshizo su pago.'];
    default:
      return ['Revisa este Bizum.'];
  }
};

/** The buttons of a waiting Bizum. */
export interface WaitingActions {
  assign: boolean;
  /** Not while the sender must be paired first: then the rules judge it again. */
  rule: boolean;
  dismiss: true;
}

export const waitingActions = (item: WaitingBizum): WaitingActions => ({
  assign: item.senderIdentity.kind !== 'player',
  rule:
    item.reason.code !== 'sender_unknown' &&
    item.reason.code !== 'sender_ambiguous',
  dismiss: true,
});

/** The players to offer for the sender: the suggestions first, then everyone else. */
export const playerChoices = <P extends { id: number }>(
  item: WaitingBizum,
  everyone: readonly P[]
): { suggested: P[]; others: P[] } => {
  const ids =
    item.senderIdentity.kind === 'unknown'
      ? item.senderIdentity.suggestions
      : item.senderIdentity.kind === 'ambiguous'
        ? item.senderIdentity.playerIds
        : [];
  return {
    suggested: ids.flatMap(id => everyone.filter(p => p.id === id)),
    others: everyone.filter(p => !ids.includes(p.id)),
  };
};

/** The one player suggested for an unknown sender, who the organiser can accept with one tap. */
export const suggestedPlayer = (
  item: WaitingBizum
): { id: number; name: string } | null =>
  item.senderIdentity.kind === 'unknown' &&
  item.senderIdentity.suggestions.length === 1
    ? {
        id: item.senderIdentity.suggestions[0],
        name: nameOf(item, item.senderIdentity.suggestions[0]),
      }
    : null;

/** The player the ruling starts from: the identified one, else the first suggestion. */
export const defaultPlayerId = (item: WaitingBizum): number | null => {
  const identity = item.senderIdentity;
  if (identity.kind === 'player') return identity.playerId;
  if (identity.kind === 'unknown') return identity.suggestions[0] ?? null;
  return identity.playerIds[0] ?? null;
};

/** What pairing saves, in words: the phone, or the name next to the ones the player already has. */
export const pairingText = (
  item: WaitingBizum,
  playerName: string,
  current: readonly string[]
) => {
  const saved =
    item.sender.phone !== null
      ? `Se guardará su teléfono ${item.sender.phone}`
      : current.length === 0
        ? `Se guardará «${item.sender.name ?? ''}» como su nombre de Bizum`
        : `Se guardará «${item.sender.name ?? ''}» como otro nombre de Bizum de ${playerName}, que ya tiene ${andList(current.map(name => `«${name}»`))},`;
  return `${saved} y se volverán a aplicar las reglas a los Bizums en espera de ${playerName}.`;
};

/** What pairing did, one line each: what settled, what still waits and who else shares the name. */
export const pairResultLines = (result: PairResult): string[] => {
  const settled = result.results.filter(r => r.status === 'settled').length;
  const waiting = result.results.length - settled;
  const lines = [
    settled === 0
      ? 'No se liquidó ningún Bizum.'
      : settled === 1
        ? 'Se liquidó 1 Bizum.'
        : `Se liquidaron ${settled} Bizums.`,
  ];
  if (waiting > 0) {
    lines.push(
      waiting === 1
        ? 'Sigue en espera 1 Bizum.'
        : `Siguen en espera ${waiting} Bizums.`
    );
  }
  if (result.sharedWith.length > 0) {
    lines.push(
      `Atención: también tiene ese nombre ${orList(result.sharedWith.map(p => p.name))}. Los Bizums de ese remitente esperarán hasta que quites uno de los dos.`
    );
  }
  return lines;
};
