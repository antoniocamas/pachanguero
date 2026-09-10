import { describe, expect, it } from 'vitest';
import { buildConvocatoria, type History } from './convocatoria.js';
import { computePoints, waitCounter } from './points.js';
import { seniorityPoints } from './seniority.js';
import { DEFAULT_RULES, type Contender, type ExclusionKind, type SeasonRules } from './types.js';

const rules = (over: Partial<SeasonRules> = {}): SeasonRules => ({ ...DEFAULT_RULES, ...over });

describe('seniority', () => {
  // The Aux tab of the 2024/2025 sheet, to its full precision.
  const aux: Array<[number, number]> = [
    [1, 1], [2, 1.79248125], [3, 2.475087445], [4, 3.088234638],
    [5, 3.652809672], [6, 4.181130505], [7, 4.681130505], [8, 5.15825176],
    [9, 5.61640867], [10, 6.058522779], [11, 6.48684012], [12, 6.903129784],
    [13, 7.308813655],
  ];

  it.each(aux)('season %i matches the Aux table', (seasons, expected) => {
    expect(seniorityPoints(seasons)).toBeCloseTo(expected, 8);
  });

  it('is zero below one season and extends past the table', () => {
    expect(seniorityPoints(0)).toBe(0);
    expect(seniorityPoints(-3)).toBe(0);
    expect(seniorityPoints(20)).toBeGreaterThan(seniorityPoints(13));
  });

  it('has diminishing returns', () => {
    const steps = Array.from({ length: 12 }, (_, i) => seniorityPoints(i + 2) - seniorityPoints(i + 1));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });
});

describe('points', () => {
  // Rows straight off the Puntos tab: paid, exclusions, seasons -> total.
  const rows: Array<[string, number, number, number, number]> = [
    ['Antonio C', 30, 0, 13, 37.308813655],
    ['Fer', 30, 1, 2, 32.79248125],
    ['Nacho', 19, 3, 1, 23],
    ['Emma', 24, 4, 2, 29.79248125],
    ['Miguel', 34, 0, 13, 41.308813655],
    ['Pablo', 11, 7, 2, 19.79248125],
    ['Pablo Silvage', 4, 6, 1, 11],
    ['Dani', 6, 1, 7, 11.681130505],
    ['Adri', 4, 0, 0, 4],
  ];

  it.each(rows)('%s', (_name, paidGames, exclusions, seasons, total) => {
    expect(computePoints({ paidGames, exclusions, seasons }).total).toBeCloseTo(total, 8);
  });

  it('paying for guests still scores a single point', () => {
    // An 8 or a 16 in Pagos is one attendance, not two or four.
    expect(computePoints({ paidGames: 1, exclusions: 0, seasons: 0 }).attendance).toBe(1);
  });
});

describe('waitCounter', () => {
  const legacy = rules({ mercyResetsCounter: false });
  const stated = rules({ mercyResetsCounter: true });
  const h = (...k: ExclusionKind[]) => k;

  it('counts both exclusion kinds but never a mercy seat', () => {
    expect(waitCounter(h('points', 'demoted'), legacy)).toBe(2);
  });

  it('reproduces the legacy remainder bug', () => {
    // Pablo Silvage: 1,1,1,D,1,1,1,D — carries +1 twice, ends eligible.
    const silvage = h('points', 'points', 'points', 'mercy', 'points', 'points', 'points', 'mercy');
    expect(waitCounter(silvage, legacy)).toBe(2);
    expect(waitCounter(silvage, stated)).toBe(0);
  });

  it('agrees with the stated rule when the wait was exactly the threshold', () => {
    // Pablo: 1,1,D,1,1,D,1,1,2 — never waits more than 2, so both agree.
    const pablo = h('points', 'points', 'mercy', 'points', 'points', 'mercy', 'points', 'points', 'demoted');
    expect(waitCounter(pablo, legacy)).toBe(3);
    expect(waitCounter(pablo, stated)).toBe(3);
  });
});

describe('buildConvocatoria', () => {
  const players = (n: number): Contender[] =>
    Array.from({ length: n }, (_, i) => ({
      playerId: i + 1,
      name: `P${String(i + 1).padStart(2, '0')}`,
      points: 100 - i,
    }));

  it('lets everyone play when not oversubscribed', () => {
    const r = buildConvocatoria(players(14), new Map(), rules());
    expect(r.oversubscribed).toBe(false);
    expect(r.swaps).toEqual([]);
    expect(r.entries.every((e) => e.playing)).toBe(true);
  });

  it('cuts at the slot count on points alone when nobody qualifies', () => {
    const r = buildConvocatoria(players(18), new Map(), rules());
    expect(r.oversubscribed).toBe(true);
    expect(r.swaps).toEqual([]);
    expect(r.entries.filter((e) => e.playing)).toHaveLength(14);
    expect(r.entries.filter((e) => e.outcome === 'excluded')).toHaveLength(4);
  });

  it('promotes a waiting player and demotes the bottom of the cut', () => {
    const history: History = new Map([[16, ['points', 'points']]]);
    const r = buildConvocatoria(players(18), history, rules());

    expect(r.swaps).toEqual([{ promoted: 16, demoted: 14 }]);
    const promoted = r.entries.find((e) => e.playerId === 16)!;
    const demoted = r.entries.find((e) => e.playerId === 14)!;
    expect(promoted.outcome).toBe('mercy');
    expect(promoted.playing).toBe(true);
    expect(demoted.outcome).toBe('demoted');
    expect(demoted.playing).toBe(false);
    expect(r.entries.filter((e) => e.playing)).toHaveLength(14);
  });

  it('will not promote from inside the cut', () => {
    // P10 is already playing; a long wait must not earn a second seat.
    const history: History = new Map([[10, ['points', 'points', 'points']]]);
    expect(buildConvocatoria(players(18), history, rules()).swaps).toEqual([]);
  });

  it('needs gamesOutForMercy, not merely one game out', () => {
    const history: History = new Map([[16, ['points']]]);
    expect(buildConvocatoria(players(18), history, rules()).swaps).toEqual([]);
  });

  it('prefers the longest wait', () => {
    const history: History = new Map<number, ExclusionKind[]>([
      [15, ['points', 'points']],
      [16, ['points', 'points', 'points']],
    ]);
    expect(buildConvocatoria(players(18), history, rules()).swaps[0].promoted).toBe(16);
  });

  it('breaks a tied wait by fewest mercy seats received', () => {
    const history: History = new Map<number, ExclusionKind[]>([
      // Same wait of 2, but P15 has already been shown mercy twice.
      [15, ['mercy', 'mercy', 'points', 'points']],
      [16, ['points', 'points']],
    ]);
    expect(buildConvocatoria(players(18), history, rules({ mercyResetsCounter: true })).swaps[0].promoted).toBe(16);
  });

  it('breaks a fully tied candidate by points', () => {
    const history: History = new Map<number, ExclusionKind[]>([
      [15, ['points', 'points']],
      [16, ['points', 'points']],
    ]);
    // P15 has more points than P16, so it takes the seat.
    expect(buildConvocatoria(players(18), history, rules()).swaps[0].promoted).toBe(15);
  });

  it('demotes someone never demoted before, over the very bottom', () => {
    const history: History = new Map<number, ExclusionKind[]>([
      [16, ['points', 'points']],
      [14, ['demoted']], // bottom of the cut, but already took one for the team
    ]);
    expect(buildConvocatoria(players(18), history, rules()).swaps[0].demoted).toBe(13);
  });

  it('demotes twice rather than failing when everyone inside has been demoted', () => {
    const history: History = new Map<number, ExclusionKind[]>([[16, ['points', 'points']]]);
    for (let i = 1; i <= 14; i++) history.set(i, ['demoted']);
    const r = buildConvocatoria(players(18), history, rules());
    expect(r.swaps).toHaveLength(1);
    expect(r.swaps[0].demoted).toBe(14);
  });

  it('honours top-down demotion', () => {
    const history: History = new Map([[16, ['points', 'points']]]);
    const r = buildConvocatoria(players(18), history, rules({ demotionDirection: 'top-down' }));
    expect(r.swaps[0].demoted).toBe(1);
  });

  it('fills two mercy seats when configured, as the 29/01 game did', () => {
    const history: History = new Map<number, ExclusionKind[]>([
      [16, ['points', 'points', 'points']],
      [17, ['points', 'points']],
    ]);
    const r = buildConvocatoria(players(18), history, rules({ mercySeats: 2 }));
    expect(r.swaps.map((s) => s.promoted)).toEqual([16, 17]);
    expect(r.swaps.map((s) => s.demoted)).toEqual([14, 13]);
    expect(r.entries.filter((e) => e.playing)).toHaveLength(14);
  });

  it('keeps a zero-point player in the running instead of corrupting the sort', () => {
    // The legacy `0 || "Not Found"` turned this into NaN and scrambled the list.
    const squad = [...players(17), { playerId: 99, name: 'Tave', points: 0 }];
    const r = buildConvocatoria(squad, new Map(), rules());
    expect(r.entries).toHaveLength(18);
    expect(r.entries.at(-1)).toMatchObject({ playerId: 99, playing: false });
    expect(r.entries.map((e) => e.points)).toEqual([...r.entries.map((e) => e.points)].sort((a, b) => b - a));
  });

  it('orders equal points deterministically by name', () => {
    const tied: Contender[] = [
      { playerId: 2, name: 'Zoe', points: 10 },
      { playerId: 1, name: 'Ana', points: 10 },
    ];
    const once = buildConvocatoria(tied, new Map(), rules()).entries.map((e) => e.name);
    const twice = buildConvocatoria([...tied].reverse(), new Map(), rules()).entries.map((e) => e.name);
    expect(once).toEqual(['Ana', 'Zoe']);
    expect(twice).toEqual(['Ana', 'Zoe']);
  });
});
