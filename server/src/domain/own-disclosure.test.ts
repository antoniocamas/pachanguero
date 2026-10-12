import { describe, expect, it } from 'vitest';
import {
  OwnDisclosure,
  type DebtInput,
  type PaymentInput,
} from './own-disclosure.js';

const CARLOS = 1;
const ANA = 2;
const LUIS = 3;

describe('OwnDisclosure', () => {
  const carlos = new OwnDisclosure(CARLOS);

  const debt = (over: Partial<DebtInput>): DebtInput => ({
    gameId: 10,
    playedOn: '2026-10-07',
    gameLabel: null,
    holderId: CARLOS,
    holderName: 'Carlos',
    beneficiaryId: CARLOS,
    amountCents: 500,
    ...over,
  });
  const payment = (over: Partial<PaymentInput>): PaymentInput => ({
    gameId: 10,
    playedOn: '2026-10-07',
    gameLabel: null,
    holderId: CARLOS,
    payerId: CARLOS,
    payerName: 'Carlos',
    beneficiaryId: CARLOS,
    amountCents: 500,
    paidOn: '2026-10-08',
    ...over,
  });

  describe('debts', () => {
    it('shows a share held for oneself as "own" and counts it', () => {
      expect(carlos.debts([debt({})])).toEqual({
        owedCents: 500,
        mine: [
          {
            gameId: 10,
            playedOn: '2026-10-07',
            label: null,
            amountCents: 500,
            kind: 'own',
          },
        ],
        heldByHost: [],
      });
    });

    it('shows a share held for a guest as "guest" with no name or id, and counts it', () => {
      const result = carlos.debts([
        debt({ beneficiaryId: ANA, holderName: 'Carlos' }),
        debt({ beneficiaryId: null }),
      ]);
      expect(result.owedCents).toBe(1000);
      expect(result.mine.map(r => r.kind)).toEqual(['guest', 'guest']);
      expect(JSON.stringify(result)).not.toMatch(/Ana|beneficiary|holder/i);
    });

    it('shows a share held by the host with the host name, outside the total', () => {
      const result = carlos.debts([debt({ holderId: ANA, holderName: 'Ana' })]);
      expect(result.owedCents).toBe(0);
      expect(result.mine).toEqual([]);
      expect(result.heldByHost).toEqual([
        {
          gameId: 10,
          playedOn: '2026-10-07',
          label: null,
          amountCents: 500,
          holderName: 'Ana',
        },
      ]);
    });

    it('never reads a share that is neither held by nor for the player', () => {
      const result = carlos.debts([
        debt({ holderId: ANA, holderName: 'Ana', beneficiaryId: LUIS }),
      ]);
      expect(result).toEqual({ owedCents: 0, mine: [], heldByHost: [] });
    });

    it('is empty when nothing is owed', () => {
      expect(carlos.debts([])).toEqual({
        owedCents: 0,
        mine: [],
        heldByHost: [],
      });
    });
  });

  describe('payments', () => {
    it('shows a payment of the own share made by the player as "own" paid by nobody', () => {
      expect(carlos.payments([payment({})])).toEqual([
        {
          gameId: 10,
          playedOn: '2026-10-07',
          label: null,
          amountCents: 500,
          paidOn: '2026-10-08',
          kind: 'own',
          paidBy: null,
        },
      ]);
    });

    it('names the payer when the host who answers for the share paid it', () => {
      const [row] = carlos.payments([
        payment({ holderId: ANA, payerId: ANA, payerName: 'Ana' }),
      ]);
      expect(row.kind).toBe('own');
      expect(row.paidBy).toEqual({ name: 'Ana' });
    });

    it('marks a share the player paid for a guest as "guest"', () => {
      const [row] = carlos.payments([payment({ beneficiaryId: ANA })]);
      expect(row.kind).toBe('guest');
      expect(row.paidBy).toBeNull();
      expect(JSON.stringify(row)).not.toContain('Ana');
    });

    it('does not name a third person who paid', () => {
      const [row] = carlos.payments([
        payment({ holderId: ANA, payerId: LUIS, payerName: 'Luis' }),
      ]);
      expect(row.paidBy).toBe('other');
      expect(JSON.stringify(row)).not.toContain('Luis');
    });

    it('leaves out payments that are neither by nor for the player', () => {
      expect(
        carlos.payments([
          payment({ holderId: ANA, payerId: ANA, beneficiaryId: LUIS }),
        ])
      ).toEqual([]);
    });
  });

  describe('report', () => {
    const report = {
      player: { id: CARLOS, name: 'Carlos' },
      seasonStats: {
        points: { points: 7, paidGames: 3, rank: 2, of: 14 },
        mercy: { count: 0 },
      },
      games: [
        {
          gameId: 10,
          stats: {
            payment: {
              status: 'paid',
              amountCents: 500,
              payerId: ANA,
              payerName: 'Ana',
              holderId: ANA,
              paidOn: '2026-10-08',
            },
          },
        },
        {
          gameId: 9,
          stats: {
            payment: {
              status: 'paid',
              amountCents: 500,
              payerId: LUIS,
              payerName: 'Luis',
              holderId: ANA,
              paidOn: '2026-10-01',
            },
          },
        },
        {
          gameId: 8,
          stats: {
            payment: {
              status: 'paid',
              amountCents: 500,
              payerId: CARLOS,
              payerName: 'Carlos',
              holderId: CARLOS,
              paidOn: '2026-09-24',
            },
          },
        },
        {
          gameId: 7,
          stats: {
            payment: {
              status: 'owed',
              amountCents: 500,
              holderId: ANA,
              holderName: 'Ana',
            },
          },
        },
      ],
    };

    it('removes the standing position but keeps the points', () => {
      expect(carlos.report(report).seasonStats.points).toEqual({
        points: 7,
        paidGames: 3,
      });
      expect(carlos.report(report).seasonStats.mercy).toEqual({ count: 0 });
    });

    it('removes every player id from the payment statistic', () => {
      const text = JSON.stringify(carlos.report(report).games);
      expect(text).not.toMatch(/payerId|holderId/);
    });

    it('keeps the payer name only when the host who answers for the share paid it', () => {
      const payments = carlos
        .report(report)
        .games.map(g => g.stats.payment as { payerName?: string });
      expect(payments.map(p => p.payerName)).toEqual([
        'Ana',
        undefined,
        undefined,
        undefined,
      ]);
    });

    it('keeps the host name on an owed share', () => {
      const owed = carlos.report(report).games[3].stats.payment;
      expect(owed).toEqual({
        status: 'owed',
        amountCents: 500,
        holderName: 'Ana',
      });
    });

    it('does not change the report it was given', () => {
      carlos.report(report);
      expect(report.seasonStats.points.rank).toBe(2);
      expect(report.games[0].stats.payment).toHaveProperty('payerId');
    });

    it('copes with a player who has no points statistic or no payment', () => {
      const bare = {
        seasonStats: { points: null },
        games: [{ stats: { callUp: { x: 1 } } }],
      };
      expect(carlos.report(bare)).toEqual(bare);
    });
  });
});
