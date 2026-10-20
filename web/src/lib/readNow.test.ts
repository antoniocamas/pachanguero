import { describe, expect, it } from 'vitest';
import type { ReadAnswer } from '../api';
import { fmtTime } from './dates';
import { readAnswerText } from './readNow';

const counts = {
  entries: 12,
  kept: 3,
  discarded: 1,
  notBizum: 5,
  pending: 0,
  unidentified: 0,
  known: 3,
};

describe('readAnswerText', () => {
  it('reports what a read found', () => {
    expect(readAnswerText({ kind: 'read', counts })).toBe(
      'Lectura terminada: 12 movimientos, 3 nuevos'
    );
  });

  it.each([
    ['in_progress', 'Ya se está leyendo el banco.'],
    ['too_soon', 'Espera unos minutos antes de volver a leer.'],
    ['not_ready', 'Todavía no se puede leer: revisa el panel del banco.'],
  ] as const)('tells the refusal %s', (code, text) => {
    expect(readAnswerText({ kind: 'refused', code, until: null })).toBe(text);
  });

  it('tells the hour the bank asked to wait for', () => {
    const until = '2027-03-10T10:45:00Z';
    expect(
      readAnswerText({ kind: 'refused', code: 'rate_limited', until })
    ).toBe(`El banco pide esperar hasta ${fmtTime(until)}.`);
  });

  it('tells a read that failed', () => {
    const answer: ReadAnswer = {
      kind: 'failed',
      failure: 'unavailable',
      code: 'TIMEOUT',
    };
    expect(readAnswerText(answer)).toBe(
      'No se pudo leer: no se pudo contactar con el banco (TIMEOUT)'
    );
  });
});
