import { describe, expect, it } from 'vitest';
import type { SettledBizum } from '../api';
import {
  filterSettled,
  groupByMonth,
  paidPlayers,
  sortSettled,
} from './settledBizums';

const settled = (over: Partial<SettledBizum>): SettledBizum => ({
  id: 1,
  bookedOn: '2026-10-12',
  amountCents: 400,
  currency: 'EUR',
  sender: { name: 'Luis P.', phone: null },
  subject: 'pachanga',
  settledHow: 'automatic',
  unallocatedCents: 0,
  payments: [
    {
      paymentId: 1,
      gameId: 1,
      playedOn: '2026-10-07',
      playerName: 'Luis Pérez',
      amountCents: 400,
    },
  ],
  ...over,
});

const luis = settled({ id: 1 });
const adam = settled({
  id: 2,
  bookedOn: '2026-09-28',
  amountCents: 800,
  sender: { name: null, phone: '+34 612 345 678' },
  subject: 'cena',
  settledHow: 'organiser',
  payments: [
    {
      paymentId: 2,
      gameId: 2,
      playedOn: '2026-09-16',
      playerName: 'Adam Ruiz',
      amountCents: 400,
    },
    {
      paymentId: 3,
      gameId: 3,
      playedOn: '2026-09-23',
      playerName: 'Adam Ruiz',
      amountCents: 400,
    },
  ],
});
const all = [luis, adam];

describe('filterSettled', () => {
  const find = (text: string, how: 'all' | 'automatic' | 'organiser' = 'all') =>
    filterSettled(all, { text, how }).map(i => i.id);

  it('keeps everything without a search', () => {
    expect(find('')).toEqual([1, 2]);
  });

  it('matches the Bizum name and the player it paid for', () => {
    expect(find('luis p.')).toEqual([1]);
    expect(find('perez')).toEqual([1]);
    expect(find('ruiz')).toEqual([2]);
  });

  it('matches the phone, the subject, the amount and the dates', () => {
    expect(find('612 345')).toEqual([2]);
    expect(find('cena')).toEqual([2]);
    expect(find('8,00')).toEqual([2]);
    expect(find('12/10')).toEqual([1]);
    expect(find('16/09')).toEqual([2]);
  });

  it('needs every word, in any order', () => {
    expect(find('perez luis')).toEqual([1]);
    expect(find('luis ruiz')).toEqual([]);
  });

  it('filters by how it was settled, alone or with a search', () => {
    expect(find('', 'organiser')).toEqual([2]);
    expect(find('luis', 'organiser')).toEqual([]);
  });
});

describe('sortSettled', () => {
  it('orders by booking date, newest first or oldest first', () => {
    expect(sortSettled(all, 'newest').map(i => i.id)).toEqual([1, 2]);
    expect(sortSettled(all, 'oldest').map(i => i.id)).toEqual([2, 1]);
  });
});

describe('groupByMonth', () => {
  it('puts the Bizums of one month under one heading', () => {
    const groups = groupByMonth(sortSettled(all, 'newest'));
    expect(groups.map(g => g.items.length)).toEqual([1, 1]);
    expect(groups[0].heading).toContain('octubre');
    expect(groups[1].heading).toContain('septiembre');
  });
});

describe('paidPlayers', () => {
  it('names each player once', () => {
    expect(paidPlayers(adam)).toEqual(['Adam Ruiz']);
  });
});
