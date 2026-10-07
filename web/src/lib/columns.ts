import type { GameRow, TableState } from './gameRows';

export type ColumnId =
  'position' | 'arrival' | 'player' | 'points' | 'played' | 'team' | 'payment';

export interface Column {
  id: ColumnId;
  label: string;
  /** Right-aligned figures. */
  numeric: boolean;
  /** Hidden on a phone: its content moves under the player's name. */
  collapsesOnPhone: boolean;
}

const ALL: Record<ColumnId, Column> = {
  position: {
    id: 'position',
    label: 'Orden',
    numeric: true,
    collapsesOnPhone: false,
  },
  arrival: {
    id: 'arrival',
    label: 'Llegada',
    numeric: true,
    collapsesOnPhone: true,
  },
  player: {
    id: 'player',
    label: 'Jugador',
    numeric: false,
    collapsesOnPhone: false,
  },
  points: {
    id: 'points',
    label: 'Puntos',
    numeric: true,
    collapsesOnPhone: true,
  },
  played: {
    id: 'played',
    label: 'Jugó',
    numeric: false,
    collapsesOnPhone: false,
  },
  team: { id: 'team', label: 'Equipo', numeric: false, collapsesOnPhone: true },
  payment: {
    id: 'payment',
    label: 'Pago',
    numeric: false,
    collapsesOnPhone: false,
  },
};

const BY_STATE: Record<TableState, ColumnId[]> = {
  open: ['arrival', 'player', 'points'],
  convocatoria_created: ['position', 'arrival', 'player', 'points'],
  convocatoria_confirmed: ['position', 'arrival', 'player', 'points'],
  played: [
    'position',
    'arrival',
    'player',
    'points',
    'played',
    'team',
    'payment',
  ],
};

/** The columns of the players table for a state. */
export const columnsFor = (state: TableState): Column[] =>
  BY_STATE[state].map(id => ALL[id]);

export interface Sort {
  column: ColumnId;
  direction: 'asc' | 'desc';
}

/** Clicking a header: first sorts by that column, clicking again reverses. */
export const toggleSort = (current: Sort | null, column: ColumnId): Sort =>
  current?.column === column
    ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { column, direction: column === 'points' ? 'desc' : 'asc' };

const valueOf = (row: GameRow, column: ColumnId): number | string => {
  switch (column) {
    case 'position':
      return row.position ?? Number.MAX_SAFE_INTEGER;
    case 'arrival':
      return row.arrival ?? Number.MAX_SAFE_INTEGER;
    case 'player':
      return row.name;
    case 'points':
      return row.points ?? -Infinity;
    case 'played':
      return Number(row.played === true);
    case 'team':
      return row.team ?? '';
    case 'payment':
      return row.owedCents;
  }
};

const compare = (a: number | string, b: number | string): number =>
  typeof a === 'string' || typeof b === 'string'
    ? String(a).localeCompare(String(b), 'es')
    : a - b;

/**
 * The rows ordered by a column, ties broken by name. A plus-one drawn under
 * its host stays under it however the hosts are ordered.
 */
export const sortRows = (rows: readonly GameRow[], sort: Sort): GameRow[] => {
  const sign = sort.direction === 'asc' ? 1 : -1;
  const groups: GameRow[][] = [];
  for (const row of rows) {
    if (row.sub && groups.length) groups[groups.length - 1].push(row);
    else groups.push([row]);
  }
  return groups
    .sort(
      ([a], [b]) =>
        sign * compare(valueOf(a, sort.column), valueOf(b, sort.column)) ||
        a.name.localeCompare(b.name, 'es')
    )
    .flat();
};
