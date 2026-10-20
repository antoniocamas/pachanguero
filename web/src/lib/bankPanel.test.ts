import { describe, expect, it } from 'vitest';
import type { BankBanner, BankPanel, LastRead } from '../api';
import {
  accountLabel,
  accountsToChoose,
  bannerText,
  connectionButtons,
  daysLeftText,
  expiryText,
  lastReadText,
  stateLabel,
  withWord,
  withoutWord,
} from './bankPanel';

const account = (stableId: string, last4: string, currency = 'EUR') => ({
  stableId,
  currency,
  kind: 'CACC',
  last4,
});

/** A panel as the server sends it, with the parts a test changes given over it. */
const panel = (over: Partial<BankPanel> = {}): BankPanel => ({
  setup: [],
  bank: {
    chosenId: 'fake',
    options: [{ id: 'fake', displayName: 'Banco Ficticio' }],
    editable: true,
  },
  canConnect: true,
  connection: null,
  currency: 'EUR',
  accounts: [],
  selection: { kind: 'not_connected', stableId: null },
  startDate: null,
  words: { include: ['pachanga'], exclude: [] },
  readiness: { ready: false, missing: ['not_connected'] },
  lastRead: null,
  ...over,
});

const connected = (over: Partial<NonNullable<BankPanel['connection']>> = {}) =>
  panel({
    connection: {
      state: 'connected',
      validUntil: '2027-03-30T10:00:00Z',
      daysLeft: 10,
      renewSuggested: true,
      reason: null,
      accounts: [],
      ...over,
    },
  });

describe('stateLabel', () => {
  it('names the three states of the frames', () => {
    expect(stateLabel(panel())).toBe('Sin conexión');
    expect(stateLabel(connected())).toBe('Conectado · Banco Ficticio');
    expect(stateLabel(connected({ state: 'reconnect_needed' }))).toBe(
      'Reconexión necesaria'
    );
  });
});

describe('connectionButtons', () => {
  it('offers to connect, with the bank named, when there is no connection', () => {
    expect(connectionButtons(panel())).toEqual({
      connect: { label: 'Conectar con Banco Ficticio', disabled: false },
      renew: null,
      disconnect: false,
    });
  });

  it('disables connecting while the setup is incomplete', () => {
    expect(
      connectionButtons(panel({ canConnect: false })).connect?.disabled
    ).toBe(true);
  });

  it('makes renewing the primary action once the end is near', () => {
    expect(connectionButtons(connected())).toEqual({
      connect: null,
      renew: { primary: true },
      disconnect: true,
    });
    expect(
      connectionButtons(connected({ renewSuggested: false, daysLeft: 90 }))
        .renew
    ).toEqual({ primary: false });
  });

  it('offers to connect again, and to disconnect, when the access ended', () => {
    const buttons = connectionButtons(connected({ state: 'reconnect_needed' }));
    expect(buttons.connect?.label).toBe('Conectar con Banco Ficticio');
    expect(buttons.disconnect).toBe(true);
  });
});

describe('days and dates', () => {
  it('counts the days left', () => {
    expect(daysLeftText(10)).toBe('10 días restantes');
    expect(daysLeftText(1)).toBe('1 día restante');
    expect(daysLeftText(0)).toBe('caduca hoy');
  });

  it('puts the end and the days left together', () => {
    expect(expiryText('2027-03-30', 10)).toBe('30/03/2027 · 10 días restantes');
  });
});

describe('accountLabel', () => {
  it('shows only the type, the currency and the last four', () => {
    expect(accountLabel(account('h', '4821'))).toBe('Corriente · EUR ··· 4821');
  });

  it('shows a type it does not know as it is', () => {
    expect(accountLabel({ kind: 'XYZ', currency: 'USD', last4: '0001' })).toBe(
      'XYZ · USD ··· 0001'
    );
  });
});

describe('accountsToChoose', () => {
  it('keeps the accounts in the currency to read', () => {
    const accounts = [
      account('a', '1111'),
      account('b', '2222', 'USD'),
      account('c', '4444'),
    ].map(a => ({ ...a, chosen: false }));
    expect(accountsToChoose(panel({ accounts })).map(a => a.stableId)).toEqual([
      'a',
      'c',
    ]);
  });
});

describe('lastReadText', () => {
  const at = (day: number, hour = 7) => new Date(2027, 2, day, hour, 30);
  const read = (finished: Date, result = 'ok', code: string | null = null) =>
    ({ finishedAt: finished.toISOString(), result, code }) as LastRead;
  const time = (date: Date) =>
    date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  it('says today, yesterday or the date', () => {
    const now = at(10, 20);
    expect(lastReadText(read(at(10)), now)).toBe(
      `hoy ${time(at(10))} · correcta`
    );
    expect(lastReadText(read(at(9)), now)).toBe(
      `ayer ${time(at(9))} · correcta`
    );
    expect(lastReadText(read(at(2)), now)).toBe(
      `02/03/2027 ${time(at(2))} · correcta`
    );
  });

  it('says how a read that failed ended', () => {
    expect(
      lastReadText(read(at(10), 'rate_limited', 'X'), at(10, 20))
    ).toContain('el banco pidió esperar (X)');
  });
});

describe('bannerText', () => {
  const banner = (over: Partial<BankBanner>): BankBanner => ({
    show: true,
    state: 'connected',
    daysLeft: 10,
    canRead: true,
    ...over,
  });

  it('warns of the days left', () => {
    expect(bannerText(banner({}))).toBe(
      'La conexión con el banco caduca en 10 días.'
    );
    expect(bannerText(banner({ daysLeft: 1 }))).toBe(
      'La conexión con el banco caduca mañana.'
    );
    expect(bannerText(banner({ daysLeft: 0 }))).toBe(
      'La conexión con el banco caduca hoy.'
    );
  });

  it('says the access ended, and that payments by hand still work', () => {
    expect(bannerText(banner({ state: 'reconnect_needed' }))).toBe(
      'La conexión con el banco ya no es válida. Los pagos a mano siguen funcionando.'
    );
  });

  it('is absent when nothing needs the organiser', () => {
    expect(bannerText(banner({ show: false }))).toBeNull();
  });
});

describe('the word lists', () => {
  it('adds a word, trimmed, and ignores a blank or repeated one', () => {
    expect(withWord(['a'], ' b ')).toEqual(['a', 'b']);
    expect(withWord(['a'], '  ')).toEqual(['a']);
    expect(withWord(['a'], 'a')).toEqual(['a']);
  });

  it('removes a word', () => {
    expect(withoutWord(['a', 'b'], 'a')).toEqual(['b']);
  });
});
