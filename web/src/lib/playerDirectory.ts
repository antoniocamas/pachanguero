import type { DirectoryRow } from '../api';
import { fmtFullDate } from './dates';
import { euros } from './money';

export type DirectoryColumnId =
  | 'name'
  | 'role'
  | 'hosts'
  | 'introducedBy'
  | 'aliases'
  | 'bizumNames'
  | 'emails'
  | 'phone'
  | 'seasons'
  | 'played'
  | 'asGuest'
  | 'lastPlayedOn'
  | 'owed'
  | 'username'
  | 'createdOn';

export interface DirectoryColumn {
  id: DirectoryColumnId;
  label: string;
  /** Sorted and filtered as a number: a filter may then read `>3`, `<=1` or `=0`. */
  numeric: boolean;
}

/** Every column the players table can show, in the order it shows them. */
export const DIRECTORY_COLUMNS: readonly DirectoryColumn[] = [
  { id: 'name', label: 'Nombre', numeric: false },
  { id: 'role', label: 'Papel', numeric: false },
  { id: 'hosts', label: 'Anfitriones', numeric: false },
  { id: 'introducedBy', label: 'Lo trajo', numeric: false },
  { id: 'aliases', label: 'Apodos', numeric: false },
  { id: 'bizumNames', label: 'Nombres en Bizum', numeric: false },
  { id: 'emails', label: 'Correos', numeric: false },
  { id: 'phone', label: 'Teléfono', numeric: false },
  { id: 'seasons', label: 'Antigüedad', numeric: true },
  { id: 'played', label: 'Jugados', numeric: true },
  { id: 'asGuest', label: 'De invitado', numeric: true },
  { id: 'lastPlayedOn', label: 'Último partido', numeric: false },
  { id: 'owed', label: 'Debe', numeric: true },
  { id: 'username', label: 'Usuario', numeric: false },
  { id: 'createdOn', label: 'Alta', numeric: false },
];

export const DEFAULT_COLUMNS: readonly DirectoryColumnId[] = [
  'name',
  'role',
  'hosts',
  'played',
  'owed',
];

export interface DirectorySort {
  column: DirectoryColumnId;
  direction: 'asc' | 'desc';
}

export interface DirectoryQuery {
  /** Matches the name, aliases, Bizum names, emails and phone. */
  search: string;
  /** Per column: text it contains, or a comparison for a numeric one. */
  filters: Partial<Record<DirectoryColumnId, string>>;
  sort: DirectorySort;
}

/** Folded for comparing: no case, no accents. */
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');

/** What a cell shows; names are looked up for the hosts and introducer. */
export const cellText = (
  row: DirectoryRow,
  column: DirectoryColumnId,
  names: ReadonlyMap<number, string>
): string => {
  const name = (id: number | null) =>
    id === null ? '' : (names.get(id) ?? '?');
  switch (column) {
    case 'name':
      return row.name;
    case 'role':
      return row.role;
    case 'hosts':
      return row.usualHosts.map(name).join(', ');
    case 'introducedBy':
      return name(row.introducedBy);
    case 'aliases':
      return row.aliases.join(', ');
    case 'bizumNames':
      return row.bizumNames.join(', ');
    case 'emails':
      return row.emails.join(', ');
    case 'phone':
      return row.phone ?? '';
    case 'seasons':
      return row.seasons === null ? '' : String(row.seasons);
    case 'played':
      return String(row.played);
    case 'asGuest':
      return String(row.asGuest);
    case 'lastPlayedOn':
      return row.lastPlayedOn ? fmtFullDate(row.lastPlayedOn) : '';
    case 'owed':
      return row.owedCents ? euros(row.owedCents) : '';
    case 'username':
      return row.username ?? '';
    case 'createdOn':
      return row.createdOn ? fmtFullDate(row.createdOn) : '';
  }
};

/** What a column sorts and compares by: a number for the numeric ones, else folded text. */
const sortKey = (
  row: DirectoryRow,
  column: DirectoryColumnId,
  names: ReadonlyMap<number, string>
): number | string => {
  switch (column) {
    case 'seasons':
      return row.seasons ?? -1;
    case 'played':
      return row.played;
    case 'asGuest':
      return row.asGuest;
    case 'owed':
      return row.owedCents / 100;
    case 'lastPlayedOn':
      return row.lastPlayedOn ?? '';
    case 'createdOn':
      return row.createdOn;
    default:
      return fold(cellText(row, column, names));
  }
};

const COMPARISON = /^(>=|<=|>|<|=)\s*(-?\d+(?:[.,]\d+)?)$/;

/** Whether a cell passes its column's filter. */
export const passes = (
  row: DirectoryRow,
  column: DirectoryColumn,
  filter: string,
  names: ReadonlyMap<number, string>
): boolean => {
  const wanted = filter.trim();
  if (!wanted) return true;
  const comparison = column.numeric ? COMPARISON.exec(wanted) : null;
  if (comparison) {
    const value = sortKey(row, column.id, names) as number;
    const limit = Number(comparison[2].replace(',', '.'));
    switch (comparison[1]) {
      case '>':
        return value > limit;
      case '<':
        return value < limit;
      case '>=':
        return value >= limit;
      case '<=':
        return value <= limit;
      default:
        return value === limit;
    }
  }
  return fold(cellText(row, column.id, names)).includes(fold(wanted));
};

const searchable = (row: DirectoryRow) =>
  [row.name, ...row.aliases, ...row.bizumNames, ...row.emails, row.phone ?? '']
    .map(fold)
    .join('\n');

/** The rows that pass the search and every filter, in the order asked for; ties by name. */
export const queryRows = (
  rows: readonly DirectoryRow[],
  query: DirectoryQuery,
  names: ReadonlyMap<number, string>
): DirectoryRow[] => {
  const search = fold(query.search.trim());
  const filters = DIRECTORY_COLUMNS.flatMap(c =>
    query.filters[c.id] ? [[c, query.filters[c.id]!] as const] : []
  );
  const sign = query.sort.direction === 'asc' ? 1 : -1;
  return rows
    .filter(r => !search || searchable(r).includes(search))
    .filter(r => filters.every(([c, f]) => passes(r, c, f, names)))
    .sort((a, b) => {
      const x = sortKey(a, query.sort.column, names);
      const y = sortKey(b, query.sort.column, names);
      const order =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'es');
      return sign * order || a.name.localeCompare(b.name, 'es');
    });
};

/** Clicking a header sorts by it; clicking it again turns the order round. */
export const nextSort = (
  sort: DirectorySort,
  column: DirectoryColumnId
): DirectorySort =>
  sort.column === column
    ? { column, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
    : {
        column,
        direction: DIRECTORY_COLUMNS.find(c => c.id === column)?.numeric
          ? 'desc'
          : 'asc',
      };

/** The columns shown, in the table's order; the name is always one of them. */
export const shownColumns = (
  chosen: readonly DirectoryColumnId[]
): DirectoryColumn[] =>
  DIRECTORY_COLUMNS.filter(c => c.id === 'name' || chosen.includes(c.id));

/** Shows or hides a column; the name cannot be hidden. */
export const toggleColumn = (
  chosen: readonly DirectoryColumnId[],
  column: DirectoryColumnId
): DirectoryColumnId[] =>
  column === 'name'
    ? [...chosen]
    : chosen.includes(column)
      ? chosen.filter(c => c !== column)
      : [...chosen, column];

/** A remembered choice of columns, kept only where every id is still a column. */
export const readColumns = (stored: string | null): DirectoryColumnId[] => {
  if (!stored) return [...DEFAULT_COLUMNS];
  try {
    const parsed: unknown = JSON.parse(stored);
    const known = new Set<string>(DIRECTORY_COLUMNS.map(c => c.id));
    if (
      Array.isArray(parsed) &&
      parsed.every(id => typeof id === 'string' && known.has(id))
    ) {
      return parsed as DirectoryColumnId[];
    }
  } catch {
    // A broken value falls back to the defaults.
  }
  return [...DEFAULT_COLUMNS];
};
