import { describe, expect, it } from 'vitest';
import { PLAYER_SEASON_STATS, PLAYER_STATS } from './playerStats';

const payment = PLAYER_STATS.find(s => s.key === 'payment')!;

describe('payment stat view', () => {
  it('says paid, owed or nothing for a game', () => {
    expect(
      payment.cell({
        status: 'paid',
        amountCents: 400,
        payerId: 2,
        payerName: 'Bea',
        paidOn: '2025-10-08',
      })
    ).toMatchObject({ tone: 'good' });
    expect(
      payment.cell({
        status: 'owed',
        amountCents: 400,
        holderId: 1,
        holderName: 'Ana',
      })
    ).toEqual({ text: 'Debe 4 €', tone: 'bad' });
    expect(payment.cell(undefined).tone).toBe('muted');
  });

  it('summarises the games', () => {
    expect(payment.summary({ paid: 3, owed: 1, owedCents: 400 })).toBe(
      '3 pagados · 1 sin pagar (4 €)'
    );
    expect(payment.summary({ paid: 2, owed: 0, owedCents: 0 })).toContain(
      'al corriente'
    );
  });
});

describe('call-up stat view', () => {
  const callUp = PLAYER_STATS.find(s => s.key === 'callUp')!;

  it('names each outcome', () => {
    expect(callUp.cell('played').text).toBe('Jugó');
    expect(callUp.cell('mercy').text).toContain('plaza de gracia');
    expect(callUp.cell('out').tone).toBe('bad');
    expect(callUp.cell('demoted').text).toContain('Degradado');
  });

  it('counts a mercy seat as played and a demotion as out', () => {
    expect(callUp.summary({ played: 5, out: 2, mercy: 1, demoted: 1 })).toBe(
      '6 jugados · 3 fuera'
    );
  });
});

describe('season stat views', () => {
  const mercy = PLAYER_SEASON_STATS.find(s => s.key === 'mercy')!;
  const figure = (label: string, value: unknown) =>
    mercy.figures(value).find(f => f.label === label)!;

  it('says how far the next mercy seat is', () => {
    const base = {
      outOnPoints: 1,
      mercySeats: 0,
      demotions: 0,
      waitCounter: 1,
      threshold: 2,
    };
    expect(
      figure('Próxima plaza de gracia', { ...base, gamesUntilMercy: 1 }).value
    ).toBe('faltan 1 fuera');
    expect(
      figure('Próxima plaza de gracia', { ...base, gamesUntilMercy: 0 }).value
    ).toBe('Ya es candidato');
  });
});

describe('Puntos card figures', () => {
  const points = PLAYER_SEASON_STATS.find(s => s.key === 'points')!;
  const value = {
    points: 13.0902,
    paidGames: 5,
    exclusions: 0,
    seniority: 8.0902,
    gamesPlayed: 5,
    rank: 2,
    of: 22,
  };
  const figure = (label: string) =>
    points.figures(value).find(f => f.label === label)?.value;

  it('shows each field', () => {
    expect(figure('Puntos')).toBe('13,09');
    expect(figure('Puesto')).toBe('2 de 22');
    expect(figure('Partidos jugados')).toBe('5');
    expect(figure('Por partidos pagados')).toBe('5');
    expect(figure('Por quedar fuera')).toBe('0');
    expect(figure('Por antigüedad')).toBe('8,09');
  });

  it('shows parts that add up to the total shown', () => {
    const n = (label: string) => Number(figure(label)!.replace(',', '.'));
    expect(
      n('Por partidos pagados') + n('Por quedar fuera') + n('Por antigüedad')
    ).toBeCloseTo(n('Puntos'), 2);
  });
});

describe('Plaza de gracia card figures', () => {
  const mercy = PLAYER_SEASON_STATS.find(s => s.key === 'mercy')!;
  const value = {
    outOnPoints: 2,
    mercySeats: 1,
    demotions: 1,
    waitCounter: 1,
    threshold: 2,
    gamesUntilMercy: 1,
  };
  const figure = (label: string) =>
    mercy.figures(value).find(f => f.label === label)?.value;

  it('shows each field', () => {
    expect(figure('Fuera por puntos')).toBe('2');
    expect(figure('Plazas de gracia')).toBe('1');
    expect(figure('Degradado')).toBe('1');
    expect(figure('Contador de espera')).toBe('1 de 2');
    expect(figure('Próxima plaza de gracia')).toBe('faltan 1 fuera');
  });
});

describe('payment and call-up cells', () => {
  const payment = PLAYER_STATS.find(s => s.key === 'payment')!;

  it('writes who paid, how much and when', () => {
    const cell = payment.cell({
      status: 'paid',
      amountCents: 400,
      payerId: 2,
      payerName: 'Bea',
      paidOn: '2026-03-04',
    });
    expect(cell.text).toContain('Pagado 4 €');
    expect(cell.text).toContain('por Bea');
    expect(cell.text).toContain('4');
  });

  it('shows a dash where a game has no payment', () => {
    expect(payment.cell(undefined)).toEqual({ text: '—', tone: 'muted' });
  });

  it('summarises owed games with the money still owed', () => {
    expect(payment.summary({ paid: 2, owed: 1, owedCents: 400 })).toBe(
      '2 pagados · 1 sin pagar (4 €)'
    );
  });
});
