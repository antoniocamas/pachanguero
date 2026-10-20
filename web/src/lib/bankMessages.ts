import type { BankPanel, ReadingMissing } from '../api';
import { fmtFullDate } from './dates';

/** A message for the organiser, and whether it is good news. */
export interface Message {
  tone: 'ok' | 'error';
  text: string;
}

const CALLBACK: Record<string, (bank: string) => string> = {
  unknown_state: () => 'No reconocemos esta autorización. Empieza de nuevo.',
  already_used: () => 'Esta autorización ya se usó.',
  expired: () => 'La autorización caducó. Empieza de nuevo.',
  denied: bank => `No se aprobó el acceso en ${bank}.`,
  bank_error: bank => `${bank} devolvió un error. Empieza de nuevo.`,
  code_rejected: bank =>
    `${bank} rechazó la autorización. Empieza de nuevo con una nueva.`,
  failed: () => 'No se pudo completar la conexión. Empieza de nuevo.',
};

/**
 * What the bank's redirect means: the fixed code the server leaves in the address, in words.
 * `validUntil` is the connection's end, to say until when it lasts once it is made.
 */
export const callbackMessage = (
  code: string,
  bank: string,
  validUntil: string | null
): Message => {
  if (code === 'connected') {
    return {
      tone: 'ok',
      text:
        validUntil === null
          ? 'Conectado.'
          : `Conectado hasta ${fmtFullDate(validUntil)}`,
    };
  }
  const text = CALLBACK[code];
  return {
    tone: 'error',
    text: text === undefined ? `Error del banco (${code})` : text(bank),
  };
};

const REASONS: Record<string, (bank: string) => string> = {
  CLOSED_SESSION: bank => `${bank} cerró la sesión`,
  EXPIRED_SESSION: () => 'La conexión caducó',
  EXPIRED: () => 'La conexión caducó',
  REVOKED_SESSION: bank => `Se revocó el acceso en ${bank}`,
};

/** Why a connection ended, or null when the server gave no reason. */
export const reasonText = (reason: string | null, bank: string) => {
  if (reason === null) return null;
  const text = REASONS[reason];
  return text === undefined ? `Error del banco (${reason})` : text(bank);
};

const MISSING: Record<ReadingMissing, string> = {
  not_connected: 'Falta conectar con el banco.',
  reconnect_needed: 'Falta renovar la conexión con el banco.',
  no_start_date: 'Falta indicar desde qué fecha se leen los Bizums.',
  choose_account: 'Falta elegir la cuenta que se lee.',
  no_account_in_currency: 'No hay ninguna cuenta en la moneda a leer.',
};

/** What stops the reading, one line each. */
export const missingText = (missing: readonly ReadingMissing[]): string[] =>
  missing.map(code => MISSING[code] ?? `Falta algo (${code})`);

const SETUP: Record<string, string> = {
  app_id_missing: 'no está definido',
  private_key_missing: 'no está definido',
  private_key_invalid: 'no es válido',
  public_url_missing: 'no está definido',
  public_url_invalid: 'no es una dirección https válida',
};

/** A missing setting, by its name and never its value. */
export const setupProblemText = (problem: BankPanel['setup'][number]) =>
  `${problem.setting} ${SETUP[problem.code] ?? 'no es correcto'}`;

const FAILURES: Record<string, string> = {
  session_ended: 'la conexión terminó',
  rate_limited: 'el banco pidió esperar',
  authorization_failed: 'el banco rechazó la autorización',
  misconfigured: 'la conexión está mal configurada',
  rejected: 'el banco rechazó la petición',
  unavailable: 'no se pudo contactar con el banco',
  internal: 'error interno',
};

/** How a read that did not work ended, in words. */
export const failureText = (failure: string, code: string | null) => {
  const text = FAILURES[failure] ?? `error del banco (${failure})`;
  return code === null || code === '' ? text : `${text} (${code})`;
};
