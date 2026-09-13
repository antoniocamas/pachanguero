import { describe, expect, it } from 'vitest';
import { ConvocatoriaBuilder } from './convocatoria.js';
import { ExclusionHistory } from './exclusion-history.js';
import {
  DEFAULT_RULES,
  type Contender,
  type ExclusionKind,
  type SeasonRules,
} from './types.js';

const rules = (over: Partial<SeasonRules> = {}): SeasonRules => ({
  ...DEFAULT_RULES,
  ...over,
});

const history = (
  pairs: Array<[number, ExclusionKind[]]> = []
): Map<number, ExclusionHistory> =>
  new Map(pairs.map(([id, kinds]) => [id, new ExclusionHistory(kinds)]));

describe('ConvocatoriaBuilder', () => {
  const builder = new ConvocatoriaBuilder();
  const players = (n: number): Contender[] =>
    Array.from({ length: n }, (_, i) => ({
      playerId: i + 1,
      name: `P${String(i + 1).padStart(2, '0')}`,
      points: 100 - i,
    }));

  it('lets everyone play when not oversubscribed', () => {
    const r = builder.build(players(14), history(), rules());
    expect(r.oversubscribed).toBe(false);
    expect(r.swaps).toEqual([]);
    expect(r.entries.every(e => e.playing)).toBe(true);
  });

  it('cuts at the slot count on points alone when nobody qualifies', () => {
    const r = builder.build(players(18), history(), rules());
    expect(r.oversubscribed).toBe(true);
    expect(r.swaps).toEqual([]);
    expect(r.entries.filter(e => e.playing)).toHaveLength(14);
    expect(r.entries.filter(e => e.outcome === 'excluded')).toHaveLength(4);
  });

  it('promotes a waiting player and demotes the bottom of the cut', () => {
    const r = builder.build(
      players(18),
      history([[16, ['points', 'points']]]),
      rules()
    );

    expect(r.swaps).toEqual([{ promoted: 16, demoted: 14 }]);
    const promoted = r.entries.find(e => e.playerId === 16)!;
    const demoted = r.entries.find(e => e.playerId === 14)!;
    expect(promoted.outcome).toBe('mercy');
    expect(promoted.playing).toBe(true);
    expect(demoted.outcome).toBe('demoted');
    expect(demoted.playing).toBe(false);
    expect(r.entries.filter(e => e.playing)).toHaveLength(14);
  });

  it('will not promote from inside the cut', () => {
    // P10 is already playing; a long wait must not earn a second seat.
    const h = history([[10, ['points', 'points', 'points']]]);
    expect(builder.build(players(18), h, rules()).swaps).toEqual([]);
  });

  it('needs gamesOutForMercy, not merely one game out', () => {
    const h = history([[16, ['points']]]);
    expect(builder.build(players(18), h, rules()).swaps).toEqual([]);
  });

  it('prefers the longest wait', () => {
    const h = history([
      [15, ['points', 'points']],
      [16, ['points', 'points', 'points']],
    ]);
    expect(builder.build(players(18), h, rules()).swaps[0].promoted).toBe(16);
  });

  it('breaks a tied wait by fewest mercy seats received', () => {
    const h = history([
      // Same wait of 2, but P15 has already been shown mercy twice.
      [15, ['mercy', 'mercy', 'points', 'points']],
      [16, ['points', 'points']],
    ]);
    expect(
      builder.build(players(18), h, rules({ mercyResetsCounter: true }))
        .swaps[0].promoted
    ).toBe(16);
  });

  it('breaks a fully tied candidate by points', () => {
    const h = history([
      [15, ['points', 'points']],
      [16, ['points', 'points']],
    ]);
    // P15 has more points than P16, so it takes the seat.
    expect(builder.build(players(18), h, rules()).swaps[0].promoted).toBe(15);
  });

  it('demotes someone never demoted before, over the very bottom', () => {
    const h = history([
      [16, ['points', 'points']],
      [14, ['demoted']], // bottom of the cut, but already took one for the team
    ]);
    expect(builder.build(players(18), h, rules()).swaps[0].demoted).toBe(13);
  });

  it('demotes twice rather than failing when everyone inside has been demoted', () => {
    const pairs: Array<[number, ExclusionKind[]]> = [
      [16, ['points', 'points']],
    ];
    for (let i = 1; i <= 14; i++) pairs.push([i, ['demoted']]);
    const r = builder.build(players(18), history(pairs), rules());
    expect(r.swaps).toHaveLength(1);
    expect(r.swaps[0].demoted).toBe(14);
  });

  it('honours top-down demotion', () => {
    const h = history([[16, ['points', 'points']]]);
    const r = builder.build(
      players(18),
      h,
      rules({ demotionDirection: 'top-down' })
    );
    expect(r.swaps[0].demoted).toBe(1);
  });

  it('fills two mercy seats when configured, as the 29/01 game did', () => {
    const h = history([
      [16, ['points', 'points', 'points']],
      [17, ['points', 'points']],
    ]);
    const r = builder.build(players(18), h, rules({ mercySeats: 2 }));
    expect(r.swaps.map(s => s.promoted)).toEqual([16, 17]);
    expect(r.swaps.map(s => s.demoted)).toEqual([14, 13]);
    expect(r.entries.filter(e => e.playing)).toHaveLength(14);
  });

  it('keeps a zero-point player in the running instead of corrupting the sort', () => {
    // The legacy `0 || "Not Found"` turned this into NaN and scrambled the list.
    const squad = [...players(17), { playerId: 99, name: 'Tave', points: 0 }];
    const r = builder.build(squad, history(), rules());
    expect(r.entries).toHaveLength(18);
    expect(r.entries.at(-1)).toMatchObject({ playerId: 99, playing: false });
    expect(r.entries.map(e => e.points)).toEqual(
      [...r.entries.map(e => e.points)].sort((a, b) => b - a)
    );
  });

  it('orders equal points deterministically by name', () => {
    const tied: Contender[] = [
      { playerId: 2, name: 'Zoe', points: 10 },
      { playerId: 1, name: 'Ana', points: 10 },
    ];
    const once = builder
      .build(tied, history(), rules())
      .entries.map(e => e.name);
    const twice = builder
      .build([...tied].reverse(), history(), rules())
      .entries.map(e => e.name);
    expect(once).toEqual(['Ana', 'Zoe']);
    expect(twice).toEqual(['Ana', 'Zoe']);
  });
});
