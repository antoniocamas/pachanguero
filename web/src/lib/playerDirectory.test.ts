import { describe, expect, it } from 'vitest';
import type { DirectoryRow } from '../api';
import {
  DEFAULT_COLUMNS,
  DIRECTORY_COLUMNS,
  cellText,
  nextSort,
  queryRows,
  readColumns,
  shownColumns,
  toggleColumn,
  type DirectoryQuery,
} from './playerDirectory';

const row = (over: Partial<DirectoryRow>): DirectoryRow => ({
  id: 1,
  name: 'Ana',
  aliases: [],
  introducedBy: null,
  role: 'fijo',
  roleWritten: true,
  usualHosts: [],
  emails: [],
  phone: null,
  bizumNames: [],
  seasons: 2,
  username: null,
  played: 0,
  asGuest: 0,
  lastPlayedOn: null,
  owedCents: 0,
  createdOn: '2025-09-01',
  ...over,
});

const ana = row({ id: 1, name: 'Ana', played: 5, owedCents: 400 });
const david = row({ id: 2, name: 'David', played: 9, phone: '600111222' });
const adri = row({
  id: 3,
  name: 'Adrián',
  role: 'invitado',
  usualHosts: [2],
  played: 2,
  asGuest: 2,
  aliases: ['Adri'],
});
const rows = [ana, david, adri];
const names = new Map(rows.map(r => [r.id, r.name]));
const query = (over: Partial<DirectoryQuery>): DirectoryQuery => ({
  search: '',
  filters: {},
  sort: { column: 'name', direction: 'asc' },
  ...over,
});
const ids = (out: DirectoryRow[]) => out.map(r => r.id);

describe('players table', () => {
  it('shows hosts and introducer by name', () => {
    expect(cellText(adri, 'hosts', names)).toBe('David');
    expect(cellText(row({ introducedBy: 1 }), 'introducedBy', names)).toBe(
      'Ana'
    );
    expect(cellText(ana, 'owed', names)).toBe('4 €');
    expect(cellText(david, 'owed', names)).toBe('');
  });

  it('sorts by name by default, folding accents', () => {
    expect(ids(queryRows(rows, query({}), names))).toEqual([3, 1, 2]);
  });

  it('sorts a numeric column as numbers, either way', () => {
    const desc = query({ sort: { column: 'played', direction: 'desc' } });
    expect(ids(queryRows(rows, desc, names))).toEqual([2, 1, 3]);
    const asc = query({ sort: { column: 'played', direction: 'asc' } });
    expect(ids(queryRows(rows, asc, names))).toEqual([3, 1, 2]);
  });

  it('searches the name, aliases, emails and phone, ignoring accents', () => {
    expect(ids(queryRows(rows, query({ search: 'adri' }), names))).toEqual([3]);
    expect(ids(queryRows(rows, query({ search: '600111' }), names))).toEqual([
      2,
    ]);
  });

  it('filters a column by the text it shows', () => {
    expect(
      ids(queryRows(rows, query({ filters: { role: 'invi' } }), names))
    ).toEqual([3]);
    expect(
      ids(queryRows(rows, query({ filters: { hosts: 'dav' } }), names))
    ).toEqual([3]);
  });

  it('filters a numeric column by a comparison', () => {
    const by = (filter: string) =>
      ids(queryRows(rows, query({ filters: { played: filter } }), names));
    expect(by('>4')).toEqual([1, 2]);
    expect(by('<=2')).toEqual([3]);
    expect(by('=9')).toEqual([2]);
    expect(
      ids(queryRows(rows, query({ filters: { owed: '>0' } }), names))
    ).toEqual([1]);
  });

  it('turns the order round on a second click, numbers starting from the largest', () => {
    const byName = { column: 'name' as const, direction: 'asc' as const };
    expect(nextSort(byName, 'name')).toEqual({
      column: 'name',
      direction: 'desc',
    });
    expect(nextSort(byName, 'played')).toEqual({
      column: 'played',
      direction: 'desc',
    });
  });

  it('always shows the name, and remembers a valid choice of columns only', () => {
    expect(shownColumns([]).map(c => c.id)).toEqual(['name']);
    expect(toggleColumn(['name', 'role'], 'name')).toEqual(['name', 'role']);
    expect(toggleColumn(['name', 'role'], 'role')).toEqual(['name']);
    expect(toggleColumn(['name'], 'phone')).toEqual(['name', 'phone']);
    expect(readColumns('["name","phone"]')).toEqual(['name', 'phone']);
    expect(readColumns('["name","nope"]')).toEqual([...DEFAULT_COLUMNS]);
    expect(readColumns('{')).toEqual([...DEFAULT_COLUMNS]);
    expect(readColumns(null)).toEqual([...DEFAULT_COLUMNS]);
    expect(DIRECTORY_COLUMNS[0].id).toBe('name');
  });
});
