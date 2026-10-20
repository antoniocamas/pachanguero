import { describe, expect, it } from 'vitest';
import {
  callbackMessage,
  failureText,
  missingText,
  reasonText,
  setupProblemText,
} from './bankMessages';

const BANK = 'Banco Ficticio';

describe('callbackMessage', () => {
  it('says until when the connection lasts once it is made', () => {
    expect(callbackMessage('connected', BANK, '2027-03-30T10:00:00Z')).toEqual({
      tone: 'ok',
      text: expect.stringMatching(/^Conectado hasta 30\/03\/2027$/),
    });
  });

  it('is plainly connected when the panel does not know the end yet', () => {
    expect(callbackMessage('connected', BANK, null).text).toBe('Conectado.');
  });

  it.each([
    ['unknown_state', 'No reconocemos esta autorización. Empieza de nuevo.'],
    ['already_used', 'Esta autorización ya se usó.'],
    ['expired', 'La autorización caducó. Empieza de nuevo.'],
    ['denied', 'No se aprobó el acceso en Banco Ficticio.'],
    ['bank_error', 'Banco Ficticio devolvió un error. Empieza de nuevo.'],
    [
      'code_rejected',
      'Banco Ficticio rechazó la autorización. Empieza de nuevo con una nueva.',
    ],
    ['failed', 'No se pudo completar la conexión. Empieza de nuevo.'],
  ])('tells the refusal %s in words', (code, text) => {
    expect(callbackMessage(code, BANK, null)).toEqual({ tone: 'error', text });
  });

  it('never leaves a code the app does not know blank', () => {
    expect(callbackMessage('brand_new', BANK, null)).toEqual({
      tone: 'error',
      text: 'Error del banco (brand_new)',
    });
  });
});

describe('reasonText', () => {
  it.each([
    ['CLOSED_SESSION', 'Banco Ficticio cerró la sesión'],
    ['EXPIRED_SESSION', 'La conexión caducó'],
    ['EXPIRED', 'La conexión caducó'],
    ['REVOKED_SESSION', 'Se revocó el acceso en Banco Ficticio'],
    ['SOMETHING_ELSE', 'Error del banco (SOMETHING_ELSE)'],
  ])('reads %s', (reason, text) => {
    expect(reasonText(reason, BANK)).toBe(text);
  });

  it('has nothing to say without a reason', () => {
    expect(reasonText(null, BANK)).toBeNull();
  });
});

describe('missingText', () => {
  it('says what stops the reading, one line for each', () => {
    expect(missingText(['no_start_date', 'choose_account'])).toEqual([
      'Falta indicar desde qué fecha se leen los Bizums.',
      'Falta elegir la cuenta que se lee.',
    ]);
  });
});

describe('setupProblemText', () => {
  it('names the setting and never a value', () => {
    expect(
      setupProblemText({
        code: 'public_url_invalid',
        setting: 'PACHANGUERO_PUBLIC_URL',
      })
    ).toBe('PACHANGUERO_PUBLIC_URL no es una dirección https válida');
    expect(
      setupProblemText({
        code: 'app_id_missing',
        setting: 'ENABLE_BANKING_APP_ID',
      })
    ).toBe('ENABLE_BANKING_APP_ID no está definido');
  });
});

describe('failureText', () => {
  it('adds the bank code when there is one', () => {
    expect(failureText('session_ended', 'CLOSED_SESSION')).toBe(
      'la conexión terminó (CLOSED_SESSION)'
    );
    expect(failureText('unavailable', null)).toBe(
      'no se pudo contactar con el banco'
    );
  });

  it('shows a failure it does not know as it is', () => {
    expect(failureText('odd', '')).toBe('error del banco (odd)');
  });
});
