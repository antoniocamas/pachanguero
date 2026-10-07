import { describe, expect, it } from 'vitest';
import { columnsFor, sortRows, toggleSort } from './columns';
import { DetailFixture } from './detailFixture';
import { buildRows, type TableState } from './gameRows';

const ids = (state: TableState) => columnsFor(state).map(c => c.id);

describe('columnsFor', () => {
  it('gives arrival, player and points to an open game', () => {
    expect(ids('open')).toEqual(['arrival', 'player', 'points']);
  });

  it.each<TableState>(['convocatoria_created', 'convocatoria_confirmed'])(
    'adds the position in %s',
    state => {
      expect(ids(state)).toEqual(['position', 'arrival', 'player', 'points']);
    }
  );

  it('adds played, team and payment once the game is played', () => {
    expect(ids('played')).toEqual([
      'position',
      'arrival',
      'player',
      'points',
      'played',
      'team',
      'payment',
    ]);
  });

  it('never has a column that says whether someone is signed up or in', () => {
    for (const state of [
      'open',
      'convocatoria_created',
      'convocatoria_confirmed',
      'played',
    ] as const)
      expect(ids(state)).not.toContain('signed' as never);
  });

  it('collapses the secondary columns on a phone and keeps the actionable ones', () => {
    const collapsing = columnsFor('played')
      .filter(c => c.collapsesOnPhone)
      .map(c => c.id);

    expect(collapsing).toEqual(['arrival', 'points', 'team']);
  });
});

describe('toggleSort', () => {
  it('starts ascending, and descending for points', () => {
    expect(toggleSort(null, 'player')).toEqual({
      column: 'player',
      direction: 'asc',
    });
    expect(toggleSort(null, 'points')).toEqual({
      column: 'points',
      direction: 'desc',
    });
  });

  it('reverses when the same column is chosen again', () => {
    const first = toggleSort(null, 'points');

    expect(toggleSort(first, 'points').direction).toBe('asc');
    expect(toggleSort(toggleSort(first, 'points'), 'points').direction).toBe(
      'desc'
    );
  });

  it('starts over on another column', () => {
    expect(toggleSort({ column: 'points', direction: 'asc' }, 'team')).toEqual({
      column: 'team',
      direction: 'asc',
    });
  });
});

describe('sortRows', () => {
  const table = () =>
    buildRows(
      new DetailFixture()
        .state('played')
        .player(1, 'Ana', 1)
        .player(2, 'Bea', 2)
        .player(3, 'Cai', 3)
        .entry(1, 1, { points: 3 })
        .entry(2, 2, { points: 9 })
        .entry(3, 3, { points: 6 })
        .entry({ host: 1, ordinal: 1 }, 4, { name: 'Invitado de Ana' })
        .debt(1, 1)
        .debt(1, null)
        .build()
    ).rows;

  it('orders by points and reverses when sorted again', () => {
    const descending = sortRows(table(), {
      column: 'points',
      direction: 'desc',
    });
    const ascending = sortRows(table(), { column: 'points', direction: 'asc' });

    expect(descending.filter(r => !r.sub).map(r => r.name)).toEqual([
      'Bea',
      'Cai',
      'Ana',
    ]);
    expect(ascending.filter(r => !r.sub).map(r => r.name)).toEqual([
      'Ana',
      'Cai',
      'Bea',
    ]);
  });

  it('keeps a plus-one under its host', () => {
    const rows = sortRows(table(), { column: 'player', direction: 'desc' });
    const names = rows.map(r => r.name);

    expect(names.indexOf('Invitado de Ana')).toBe(names.indexOf('Ana') + 1);
  });

  it('orders by what is owed', () => {
    const rows = sortRows(table(), { column: 'payment', direction: 'desc' });

    expect(rows[0].name).toBe('Ana');
  });

  it('breaks ties by name', () => {
    const rows = sortRows(table(), { column: 'played', direction: 'asc' });

    expect(rows.filter(r => !r.sub).map(r => r.name)).toEqual([
      'Ana',
      'Bea',
      'Cai',
    ]);
  });
});
