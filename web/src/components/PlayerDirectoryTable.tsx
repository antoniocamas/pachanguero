import { useMemo, useState } from 'react';
import type { DirectoryRow } from '../api';
import {
  DIRECTORY_COLUMNS,
  cellText,
  nextSort,
  queryRows,
  readColumns,
  shownColumns,
  toggleColumn,
  type DirectoryColumnId,
  type DirectoryQuery,
} from '../lib/playerDirectory';

const COLUMNS_KEY = 'pachanguero.players.columns';

/** The remembered columns: a convenience of this browser, so any failure means the defaults. */
const remembered = (): DirectoryColumnId[] => {
  try {
    return readColumns(window.localStorage.getItem(COLUMNS_KEY));
  } catch {
    return readColumns(null);
  }
};
const remember = (columns: DirectoryColumnId[]) => {
  try {
    window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns));
  } catch {
    // Not remembered: the table still works.
  }
};

/**
 * Every player in a table: a search, a filter under each column, sorting by any column and a
 * choice of which columns to show. A row opens that player.
 */
export function PlayerDirectoryTable({
  rows,
  onOpen,
}: {
  rows: DirectoryRow[];
  onOpen: (playerId: number) => void;
}) {
  const [chosen, setChosen] = useState<DirectoryColumnId[]>(remembered);
  const [query, setQuery] = useState<DirectoryQuery>({
    search: '',
    filters: {},
    sort: { column: 'name', direction: 'asc' },
  });
  const [filtering, setFiltering] = useState(false);
  const names = useMemo(() => new Map(rows.map(r => [r.id, r.name])), [rows]);
  const columns = shownColumns(chosen);
  const shown = useMemo(
    () => queryRows(rows, query, names),
    [rows, query, names]
  );
  const active = Object.values(query.filters).some(f => f && f.trim());

  const choose = (id: DirectoryColumnId) => {
    const next = toggleColumn(chosen, id);
    setChosen(next);
    remember(next);
  };
  const filter = (id: DirectoryColumnId, value: string) =>
    setQuery({ ...query, filters: { ...query.filters, [id]: value } });

  return (
    <>
      <div className="directory-tools">
        <input
          type="search"
          aria-label="Buscar jugador"
          placeholder="Buscar jugador, apodo, correo o teléfono"
          value={query.search}
          onChange={e => setQuery({ ...query, search: e.target.value })}
        />
        <button
          className="btn"
          aria-pressed={filtering}
          onClick={() => setFiltering(f => !f)}
        >
          Filtros{active ? ' •' : ''}
        </button>
        <details className="column-chooser">
          <summary className="btn">Columnas</summary>
          <div className="column-list" role="group" aria-label="Columnas">
            {DIRECTORY_COLUMNS.filter(c => c.id !== 'name').map(c => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={chosen.includes(c.id)}
                  onChange={() => choose(c.id)}
                />{' '}
                {c.label}
              </label>
            ))}
          </div>
        </details>
      </div>
      {active && (
        <div className="directory-active muted">
          {shown.length} de {rows.length} ·{' '}
          <button
            className="btn link"
            onClick={() => setQuery({ ...query, filters: {} })}
          >
            Quitar filtros
          </button>
        </div>
      )}
      <div className="scroll-x">
        <table className="grid directory" aria-label="Jugones">
          <thead>
            <tr>
              {columns.map(c => {
                const sorted = query.sort.column === c.id;
                return (
                  <th
                    key={c.id}
                    className={c.numeric ? 'n' : undefined}
                    aria-sort={
                      sorted
                        ? query.sort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <button
                      className="btn link sort"
                      onClick={() =>
                        setQuery({ ...query, sort: nextSort(query.sort, c.id) })
                      }
                    >
                      {c.label}
                      {sorted
                        ? query.sort.direction === 'asc'
                          ? ' ▲'
                          : ' ▼'
                        : ''}
                    </button>
                  </th>
                );
              })}
            </tr>
            {filtering && (
              <tr className="filters">
                {columns.map(c => (
                  <th key={c.id}>
                    <input
                      aria-label={`Filtrar ${c.label}`}
                      placeholder={c.numeric ? '>3, =0…' : 'contiene…'}
                      value={query.filters[c.id] ?? ''}
                      onChange={e => filter(c.id, e.target.value)}
                    />
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {shown.map(r => (
              <tr
                key={r.id}
                data-testid="directory-row"
                className="clickable"
                onClick={() => onOpen(r.id)}
              >
                {columns.map(c => (
                  <td key={c.id} className={c.numeric ? 'n' : undefined}>
                    {c.id === 'name' ? (
                      <button
                        className="btn link"
                        aria-label={`Estadísticas de ${r.name}`}
                        onClick={e => {
                          e.stopPropagation();
                          onOpen(r.id);
                        }}
                      >
                        {r.name}
                      </button>
                    ) : c.id === 'role' ? (
                      <span
                        className={`tag role ${r.role}`}
                        title={
                          r.roleWritten
                            ? undefined
                            : 'Aún sin decidir esta temporada: viene de antes'
                        }
                      >
                        {r.role}
                        {r.roleWritten ? '' : '*'}
                      </span>
                    ) : (
                      cellText(r, c.id, names)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <div className="empty">Nadie coincide.</div>}
    </>
  );
}
