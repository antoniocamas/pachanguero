import { describe, expect, it } from 'vitest';
import type { GameState } from '../api';
import { DetailFixture } from './detailFixture';
import { buildRows } from './gameRows';

const ANA = 1;
const BEA = 2;
const CAI = 3;
const DANI = 4;

/** Four players arrived in this order: Cai, Ana, Dani, Bea. */
const signedUp = () =>
  new DetailFixture()
    .player(CAI, 'Cai', 1)
    .player(ANA, 'Ana', 2)
    .player(DANI, 'Dani', 3)
    .player(BEA, 'Bea', 4);

describe('buildRows', () => {
  it('lists an open game in arrival order, with the points as of the game', () => {
    const table = buildRows(signedUp().build());

    expect(table.state).toBe('open');
    expect(table.rows.map(r => r.name)).toEqual(['Cai', 'Ana', 'Dani', 'Bea']);
    expect(table.rows.map(r => r.arrival)).toEqual([1, 2, 3, 4]);
    expect(table.rows[0].points).toBeCloseTo(4.7);
    expect(table.lineAfter).toBeNull();
  });

  it('names an anonymous plus-one after its host', () => {
    const table = buildRows(signedUp().plusOne(ANA, 5).build());

    expect(table.rows.at(-1)).toMatchObject({
      name: 'Invitado de Ana',
      playerId: null,
      key: { hostPlayerId: ANA, ordinal: 1 },
    });
  });

  it('numbers the plus-ones of a host in the order they arrived', () => {
    const table = buildRows(signedUp().plusOne(ANA, 5).plusOne(ANA, 6).build());

    expect(table.rows.slice(-2).map(r => r.key)).toEqual([
      { hostPlayerId: ANA, ordinal: 1 },
      { hostPlayerId: ANA, ordinal: 2 },
    ]);
  });

  describe.each<GameState>(['convocatoria_created', 'convocatoria_confirmed'])(
    'in %s',
    state => {
      const detail = () =>
        signedUp()
          .state(state)
          .entry(ANA, 1)
          .entry(CAI, 2)
          .entry(DANI, 4, { playing: false, outcome: 'excluded' })
          .entry(BEA, 3)
          .build();

      it('puts the members first by position, then the rest, with a line between', () => {
        const table = buildRows(detail());

        expect(table.rows.map(r => r.name)).toEqual([
          'Ana',
          'Cai',
          'Bea',
          'Dani',
        ]);
        expect(table.lineAfter).toBe(3);
        expect(table.rows.map(r => r.inLine)).toEqual([
          true,
          true,
          true,
          false,
        ]);
      });

      it('carries the arrival of each entry', () => {
        const table = buildRows(detail());

        expect(table.rows.map(r => r.arrival)).toEqual([2, 1, 4, 3]);
      });
    }
  );

  describe('labels', () => {
    const labelsOf = (options: Parameters<DetailFixture['entry']>[2]) =>
      buildRows(
        signedUp().state('convocatoria_created').entry(ANA, 1, options).build()
      ).rows[0].labels;

    it('marks the mercy seat as plaza de gracia', () => {
      expect(labelsOf({ outcome: 'mercy' })).toEqual(['plaza de gracia']);
    });

    it('marks someone demoted to make room as degradado', () => {
      expect(labelsOf({ outcome: 'demoted', playing: false })).toEqual([
        'degradado',
      ]);
    });

    it('marks a hand change as cambiado a mano', () => {
      expect(labelsOf({ byHand: true })).toEqual(['cambiado a mano']);
    });

    it('does not call a mercy seat taken away a plaza de gracia', () => {
      expect(
        labelsOf({ outcome: 'mercy', playing: false, byHand: true })
      ).toEqual(['cambiado a mano']);
    });

    it('carries no label for a plain entry', () => {
      expect(labelsOf({})).toEqual([]);
    });
  });

  describe('in a played game', () => {
    const played = () =>
      signedUp()
        .state('played')
        .entry(ANA, 1)
        .entry(BEA, 2)
        .entry(CAI, 3)
        .entry(DANI, 4, { playing: false, outcome: 'excluded' })
        .team(ANA, 'claros')
        .team(BEA, 'oscuros')
        .team(CAI, 'claros');

    it('puts those who owe first and then goes alphabetical', () => {
      const table = buildRows(played().debt(CAI, CAI).debt(BEA, BEA).build());

      expect(table.rows.map(r => r.name)).toEqual([
        'Bea',
        'Cai',
        'Ana',
        'Dani',
      ]);
      expect(table.lineAfter).toBeNull();
    });

    it('reads who played and the team from the participations', () => {
      const table = buildRows(played().build());

      expect(table.rows.find(r => r.name === 'Ana')).toMatchObject({
        played: true,
        team: 'claros',
      });
      expect(table.rows.find(r => r.name === 'Dani')).toMatchObject({
        played: false,
        team: null,
      });
    });

    it('draws a plus-one under its host, whatever the order of the hosts', () => {
      const table = buildRows(
        played()
          .entry({ host: CAI, ordinal: 1 }, 5, { name: 'Invitado de Cai' })
          .debt(CAI, CAI)
          .debt(CAI, null)
          .build()
      );

      const names = table.rows.map(r => r.name);
      expect(names.indexOf('Invitado de Cai')).toBe(names.indexOf('Cai') + 1);
      expect(table.rows.find(r => r.sub)?.name).toBe('Invitado de Cai');
    });

    it("counts a host's own and held shares as what the host owes", () => {
      const table = buildRows(played().debt(CAI, CAI).debt(CAI, null).build());

      expect(table.rows.find(r => r.name === 'Cai')?.owedCents).toBe(800);
    });

    it("counts a guest whose share is held by the host as owing through the host's row", () => {
      const table = buildRows(played().debt(ANA, ANA).debt(ANA, BEA).build());

      expect(table.rows.find(r => r.name === 'Ana')?.owedCents).toBe(800);
      expect(table.rows.find(r => r.name === 'Bea')?.owedCents).toBe(400);
    });
  });

  describe('in a cancelled game', () => {
    it('shows the table of the state it was cancelled from, read-only', () => {
      const table = buildRows(
        signedUp()
          .state('cancelled', 'convocatoria_confirmed')
          .entry(ANA, 1)
          .entry(BEA, 2)
          .build()
      );

      expect(table.state).toBe('convocatoria_confirmed');
      expect(table.readOnly).toBe(true);
      expect(table.lineAfter).toBe(2);
    });

    it('shows the arrivals of a game cancelled while still open', () => {
      const table = buildRows(signedUp().state('cancelled', 'open').build());

      expect(table.state).toBe('open');
      expect(table.rows).toHaveLength(4);
    });
  });

  it('has a table for every state of a game', () => {
    const states: GameState[] = [
      'open',
      'convocatoria_created',
      'convocatoria_confirmed',
      'played',
      'cancelled',
    ];
    for (const state of states)
      expect(() =>
        buildRows(
          signedUp()
            .state(state, state === 'cancelled' ? 'played' : null)
            .entry(ANA, 1)
            .build()
        )
      ).not.toThrow();
  });
});
