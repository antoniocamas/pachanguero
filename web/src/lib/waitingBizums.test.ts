import { describe, expect, it } from 'vitest';
import type { PairResult, WaitingBizum } from '../api';
import {
  bookedText,
  defaultPlayerId,
  identifiedAs,
  pairResultLines,
  playerChoices,
  reasonLines,
  senderText,
  waitingActions,
} from './waitingBizums';

const bizum = (over: Partial<WaitingBizum>): WaitingBizum => ({
  id: 1,
  bookedOn: '2026-10-12',
  amountCents: 1200,
  currency: 'EUR',
  sender: { name: 'Luis P.R.', phone: null },
  subject: null,
  reason: { code: 'kept' },
  players: {},
  senderIdentity: { kind: 'unknown', suggestions: [] },
  ...over,
});

/** The four items of the sketch's frame. */
const luis = bizum({
  reason: { code: 'not_enough_debts', playerId: 1, shares: 3, debts: 2 },
  players: { 1: 'Luis Pérez' },
  senderIdentity: { kind: 'player', playerId: 1 },
});
const marta = bizum({
  id: 2,
  amountCents: 450,
  sender: { name: 'Marta G.L.', phone: null },
  subject: 'pachanga',
  reason: { code: 'include_word', word: 'pachanga', wholeShares: false },
});
const unknown = bizum({
  id: 3,
  amountCents: 800,
  sender: { name: null, phone: '+34611111111' },
  reason: { code: 'sender_unknown' },
});
const ambiguous = bizum({
  id: 4,
  amountCents: 800,
  sender: { name: 'Marta G.L.', phone: null },
  reason: { code: 'sender_ambiguous', playerIds: [2, 3] },
  players: { 2: 'Marta García', 3: 'Marta Gómez' },
  senderIdentity: { kind: 'ambiguous', playerIds: [2, 3] },
});

describe('reasonLines', () => {
  it('says how many shares are owed and how many the Bizum is', () => {
    expect(reasonLines(luis)).toEqual([
      'Luis Pérez debe 2 cuotas y el Bizum son 3.',
    ]);
  });

  it('says one share in the singular', () => {
    const one = bizum({
      reason: { code: 'not_enough_debts', playerId: 1, shares: 2, debts: 1 },
      players: { 1: 'Luis Pérez' },
    });
    expect(reasonLines(one)).toEqual([
      'Luis Pérez debe 1 cuota y el Bizum son 2.',
    ]);
  });

  it('says that the amount is not a number of shares when the subject names the word', () => {
    expect(reasonLines(marta)).toEqual([
      'El importe no es un número de cuotas, pero el asunto menciona pachanga.',
    ]);
  });

  it('says only the word when the amount is whole shares', () => {
    const whole = bizum({
      reason: { code: 'include_word', word: 'pachanga', wholeShares: true },
    });
    expect(reasonLines(whole)).toEqual(['El asunto menciona pachanga.']);
  });

  it('says it does not know the sender, with no suggestion when there is none', () => {
    expect(reasonLines(unknown)).toEqual(['No sabemos quién es el remitente.']);
  });

  it.each([
    [['Marta García'], '¿Es Marta García?'],
    [['Alberto', 'Alberto H.'], '¿Es Alberto o Alberto H.?'],
    [['A', 'B', 'C'], '¿Es A, B o C?'],
  ])('asks about the suggestions %j', (names, question) => {
    const ids = names.map((_, i) => i + 10);
    const item = bizum({
      reason: { code: 'sender_unknown' },
      senderIdentity: { kind: 'unknown', suggestions: ids },
      players: Object.fromEntries(ids.map((id, i) => [id, names[i]])),
    });
    expect(reasonLines(item)).toEqual([
      'No sabemos quién es el remitente.',
      question,
    ]);
  });

  it('names the players an ambiguous sender may be', () => {
    expect(reasonLines(ambiguous)).toEqual([
      'Puede ser Marta García o Marta Gómez.',
    ]);
  });

  it.each([
    [{ code: 'no_season' }, 'No existe la temporada de esa fecha.'],
    [{ code: 'undone' }, 'Se deshizo su pago.'],
    [{ code: 'kept' }, 'Revisa este Bizum.'],
    [{ code: 'amounts_differ' }, 'Revisa este Bizum.'],
    [{ code: 'brand_new' }, 'Revisa este Bizum.'],
  ] as const)('reads %j', (reason, text) => {
    expect(
      reasonLines(bizum({ reason: reason as WaitingBizum['reason'] }))
    ).toEqual([text]);
  });
});

describe('waitingActions', () => {
  it('offers a paired sender to rule on and dismiss, but not to pair', () => {
    expect(waitingActions(luis)).toEqual({
      assign: false,
      rule: true,
      dismiss: true,
    });
  });

  it('offers an unknown sender whose amount is not whole shares everything', () => {
    expect(waitingActions(marta)).toEqual({
      assign: true,
      rule: true,
      dismiss: true,
    });
  });

  it('asks for the sender to be paired first when the amount is whole shares', () => {
    expect(waitingActions(unknown)).toEqual({
      assign: true,
      rule: false,
      dismiss: true,
    });
    expect(waitingActions(ambiguous)).toEqual({
      assign: true,
      rule: false,
      dismiss: true,
    });
  });

  it('offers a Bizum whose payments were undone to rule on again', () => {
    const undone = bizum({
      reason: { code: 'undone' },
      senderIdentity: { kind: 'player', playerId: 1 },
    });
    expect(waitingActions(undone).rule).toBe(true);
  });
});

describe('what an item says of itself', () => {
  it('shows the sender as the bank did, name or phone', () => {
    expect(senderText(luis.sender)).toBe('Luis P.R.');
    expect(senderText(unknown.sender)).toBe('+34611111111');
  });

  it('shows the date and the subject, or that there is none', () => {
    expect(bookedText(luis)).toBe('12/10 · sin asunto');
    expect(bookedText(marta)).toBe('12/10 · «pachanga»');
  });

  it('says who the sender is only when a player', () => {
    expect(identifiedAs(luis)).toBe('= Luis Pérez');
    expect(identifiedAs(marta)).toBeNull();
  });
});

describe('the players to choose', () => {
  const everyone = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: 'C' },
  ];

  it('puts the suggested players first and leaves the rest', () => {
    const item = bizum({
      senderIdentity: { kind: 'unknown', suggestions: [3] },
    });
    const { suggested, others } = playerChoices(item, everyone);
    expect(suggested.map(p => p.id)).toEqual([3]);
    expect(others.map(p => p.id)).toEqual([1, 2]);
  });

  it('starts a ruling from the identified player, else the first suggestion', () => {
    expect(defaultPlayerId(luis)).toBe(1);
    expect(
      defaultPlayerId(
        bizum({ senderIdentity: { kind: 'unknown', suggestions: [3, 2] } })
      )
    ).toBe(3);
    expect(defaultPlayerId(unknown)).toBeNull();
  });
});

describe('pairResultLines', () => {
  const result = (over: Partial<PairResult>): PairResult => ({
    replaced: null,
    sharedWith: [],
    results: [],
    waiting: [],
    ...over,
  });

  it('says what settled and what still waits', () => {
    expect(
      pairResultLines(
        result({
          results: [
            { bizumId: 1, status: 'settled' },
            { bizumId: 2, status: 'settled' },
            { bizumId: 3, status: 'waiting' },
          ],
        })
      )
    ).toEqual(['Se liquidaron 2 Bizums.', 'Sigue en espera 1 Bizum.']);
  });

  it('warns when another player holds the same name', () => {
    const lines = pairResultLines(
      result({
        results: [{ bizumId: 1, status: 'waiting' }],
        sharedWith: [{ playerId: 3, name: 'Marta Gómez' }],
      })
    );
    expect(lines[0]).toBe('No se liquidó ningún Bizum.');
    expect(lines[lines.length - 1]).toContain('Marta Gómez');
  });
});
