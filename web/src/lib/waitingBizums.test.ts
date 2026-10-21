import { describe, expect, it } from 'vitest';
import type { PairResult, SettledBizum, WaitingBizum } from '../api';
import {
  bookedText,
  defaultPlayerId,
  identifiedAs,
  pairResultLines,
  pairingText,
  playerChoices,
  reasonLines,
  settledHowText,
  settledLines,
  senderText,
  suggestedPlayer,
  waitingActions,
  waitingChoices,
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
  laterGames: [],
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
  it('says which later games the sender owes when the Bizum was booked before them', () => {
    const prepaid = bizum({
      reason: { code: 'not_enough_debts', playerId: 1, shares: 3, debts: 0 },
      players: { 1: 'Adam' },
      senderIdentity: { kind: 'player', playerId: 1 },
      laterGames: ['2026-09-28', '2026-10-05'],
    });
    expect(reasonLines(prepaid)).toEqual([
      'El Bizum paga 3 cuotas, pero Adam no debe ningún partido jugado hasta el 12 oct.',
      'Adam sí debe 2 partidos posteriores (28 sept y 5 oct): no se pagan solos, pero puedes pagarlos tú con «Pagar cuotas».',
    ]);
  });

  it('says it in the singular for one later game', () => {
    const prepaid = bizum({
      reason: { code: 'not_enough_debts', playerId: 1, shares: 2, debts: 0 },
      players: { 1: 'Adam' },
      senderIdentity: { kind: 'player', playerId: 1 },
      laterGames: ['2026-09-28'],
    });
    expect(reasonLines(prepaid)[1]).toBe(
      'Adam sí debe 1 partido posterior (28 sept): no se pagan solos, pero puedes pagarlos tú con «Pagar cuotas».'
    );
  });

  it('says how many shares are owed and how many the Bizum is', () => {
    expect(reasonLines(luis)).toEqual([
      'El Bizum paga 3 cuotas, pero Luis Pérez solo debe 2 partidos jugados hasta el 12 oct.',
    ]);
  });

  it('says one share in the singular', () => {
    const one = bizum({
      reason: { code: 'not_enough_debts', playerId: 1, shares: 2, debts: 1 },
      players: { 1: 'Luis Pérez' },
    });
    expect(reasonLines(one)).toEqual([
      'El Bizum paga 2 cuotas, pero Luis Pérez solo debe 1 partido jugado hasta el 12 oct.',
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

  it('says, for each Bizum, which games it settled, and why one still waits', () => {
    const waiting = bizum({
      id: 3,
      bookedOn: '2026-09-02',
      amountCents: 1200,
      reason: { code: 'not_enough_debts', playerId: 1, shares: 3, debts: 0 },
      players: { 1: 'Adam' },
    });
    expect(
      pairResultLines(
        result({
          results: [
            {
              bizumId: 3,
              status: 'waiting',
              bookedOn: '2026-09-02',
              amountCents: 1200,
              games: [],
            },
            {
              bizumId: 1,
              status: 'settled',
              bookedOn: '2026-09-09',
              amountCents: 400,
              games: ['2026-09-07'],
            },
            {
              bizumId: 2,
              status: 'settled',
              bookedOn: '2026-09-23',
              amountCents: 800,
              games: ['2026-09-14', '2026-09-21'],
            },
          ],
          waiting: [waiting],
        })
      )
    ).toEqual([
      'Bizum de 12 € del 02/09: sigue en espera. El Bizum paga 3 cuotas, pero Adam no debe ningún partido jugado hasta el 2 sept.',
      'Bizum de 4 € del 09/09: liquida la deuda del 7 sept.',
      'Bizum de 8 € del 23/09: liquida las deudas del 14 sept y del 21 sept.',
    ]);
  });

  it('says so when there was no Bizum to judge', () => {
    expect(pairResultLines(result({}))).toEqual([
      'No había Bizums en espera de ese remitente.',
    ]);
  });

  it('warns when another player holds the same name', () => {
    const lines = pairResultLines(
      result({
        results: [
          {
            bizumId: 1,
            status: 'waiting',
            bookedOn: '2026-09-02',
            amountCents: 400,
            games: [],
          },
        ],
        sharedWith: [{ playerId: 3, name: 'Marta Gómez' }],
      })
    );
    expect(lines[lines.length - 1]).toContain('Marta Gómez');
  });
});

describe('suggestedPlayer', () => {
  const suggested = (ids: number[]) =>
    bizum({
      reason: { code: 'sender_unknown' },
      players: { 1: 'Adam', 2: 'Adán' },
      senderIdentity: { kind: 'unknown', suggestions: ids },
    });

  it('is the one player suggested for an unknown sender, to be accepted with one tap', () => {
    expect(suggestedPlayer(suggested([1]))).toEqual({ id: 1, name: 'Adam' });
  });

  it('is nobody when two players are suggested: the organiser chooses', () => {
    expect(suggestedPlayer(suggested([1, 2]))).toBeNull();
  });

  it('is nobody when nobody is suggested, when the sender is already a player and when it is ambiguous', () => {
    expect(suggestedPlayer(suggested([]))).toBeNull();
    expect(suggestedPlayer(luis)).toBeNull();
    expect(suggestedPlayer(ambiguous)).toBeNull();
  });
});

describe('pairingText', () => {
  const named = bizum({ sender: { name: 'ADAM RON B.R.', phone: null } });
  const phoned = bizum({ sender: { name: null, phone: '+34611111111' } });

  it('says the name will be saved as his Bizum name when he has none', () => {
    expect(pairingText(named, 'Adam', [])).toBe(
      'Se guardará «ADAM RON B.R.» como su nombre de Bizum y se volverán a aplicar las reglas a los Bizums en espera de Adam.'
    );
  });

  it('says the name is added next to the ones he has, and replaces none', () => {
    const text = pairingText(named, 'Adam', ['ADAM RON B.', 'Adam R.']);
    expect(text).toBe(
      'Se guardará «ADAM RON B.R.» como otro nombre de Bizum de Adam, que ya tiene «ADAM RON B.» y «Adam R.», y se volverán a aplicar las reglas a los Bizums en espera de Adam.'
    );
    expect(text).not.toContain('Sustituirá');
  });

  it('says the phone will be saved as his phone', () => {
    expect(pairingText(phoned, 'Adam', ['ADAM RON B.'])).toBe(
      'Se guardará su teléfono +34611111111 y se volverán a aplicar las reglas a los Bizums en espera de Adam.'
    );
  });
});

describe('settledLines', () => {
  const settled = (over: Partial<SettledBizum>): SettledBizum => ({
    id: 1,
    bookedOn: '2026-10-08',
    amountCents: 800,
    currency: 'EUR',
    sender: { name: 'ADAM RON B.R.', phone: null },
    subject: 'Furgol 289 y 510',
    settledHow: 'automatic',
    unallocatedCents: 0,
    payments: [
      {
        paymentId: 1,
        gameId: 1,
        playedOn: '2026-09-28',
        playerName: 'Adam',
        amountCents: 400,
      },
      {
        paymentId: 2,
        gameId: 2,
        playedOn: '2026-10-05',
        playerName: 'Adam',
        amountCents: 400,
      },
    ],
    ...over,
  });

  it('says, one line per game, whose share it paid and how much', () => {
    expect(settledLines(settled({}))).toEqual([
      'Adam · partido del 28 sept · 4 €',
      'Adam · partido del 5 oct · 4 €',
    ]);
  });

  it('says what stays unassigned', () => {
    expect(settledLines(settled({ unallocatedCents: 400 })).at(-1)).toBe(
      'Sin asignar: 4 €'
    );
  });

  it('says who decided', () => {
    expect(settledHowText('automatic')).toBe('Automático');
    expect(settledHowText('organiser')).toBe('Decidido por ti');
  });
});

describe('waitingChoices', () => {
  it('shows the suggested player first and keeps the rest in the menu', () => {
    const item = bizum({
      reason: { code: 'sender_unknown' },
      senderIdentity: { kind: 'unknown', suggestions: [7] },
      players: { 7: 'Joaquín Ruiz' },
    });
    expect(waitingChoices(item)).toEqual({
      primary: 'accept',
      menu: ['assign', 'dismiss'],
    });
  });

  it('shows the assignment when the sender is not known and nothing is suggested', () => {
    const item = bizum({ reason: { code: 'sender_unknown' } });
    expect(waitingChoices(item)).toEqual({
      primary: 'assign',
      menu: ['dismiss'],
    });
  });

  it('shows the ruling of shares for a sender the rules know', () => {
    const item = bizum({
      reason: { code: 'not_enough_debts', playerId: 3, shares: 2, debts: 1 },
      senderIdentity: { kind: 'player', playerId: 3 },
      players: { 3: 'Marta Gómez' },
    });
    expect(waitingChoices(item)).toEqual({
      primary: 'rule',
      menu: ['dismiss'],
    });
  });
});
