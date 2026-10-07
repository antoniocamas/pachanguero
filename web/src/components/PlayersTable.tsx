import type { ComponentType, ReactNode } from 'react';
import type { Column, ColumnId, Sort } from '../lib/columns';
import { fmtPoints, TEAM_LABEL } from '../lib/format';
import type { GameRow, GameTable } from '../lib/gameRows';

/** A group of rows: plain, or a drop zone when rows can be dragged across the line. */
export type RowsBody = ComponentType<{ playing: boolean; children: ReactNode }>;

const PlainBody: RowsBody = ({ children }) => <tbody>{children}</tbody>;

/**
 * The game's players, one table whose columns follow the state. It draws what
 * `buildRows` gives it; what a row can do is handed in by the caller.
 */
export function PlayersTable({
  table,
  columns,
  sort = null,
  onSort,
  Body = PlainBody,
  leading,
  trailing,
  payment,
}: {
  table: GameTable;
  columns: Column[];
  sort?: Sort | null;
  /** Present when a header can be clicked to sort. */
  onSort?: (column: ColumnId) => void;
  Body?: RowsBody;
  /** A first cell per row, such as the grip that is dragged. */
  leading?: (row: GameRow) => ReactNode;
  /** A last cell per row, such as the button that moves it across the line. */
  trailing?: (row: GameRow) => ReactNode;
  payment?: (row: GameRow) => ReactNode;
}) {
  const { rows, lineAfter } = table;
  const groups =
    lineAfter === null
      ? [{ playing: true, rows }]
      : [
          { playing: true, rows: rows.slice(0, lineAfter) },
          { playing: false, rows: rows.slice(lineAfter) },
        ];
  const draw = (row: GameRow) => (
    <PlayerRow
      key={row.id}
      row={row}
      columns={columns}
      leading={leading}
      trailing={trailing}
      payment={payment}
      playedGame={table.state === 'played'}
    />
  );

  return (
    <table aria-label="Jugadores">
      <thead>
        <tr>
          {leading && <th className="grip" />}
          {columns.map(c => (
            <th
              key={c.id}
              className={cls(c.numeric && 'n', c.collapsesOnPhone && 'hide-sm')}
            >
              {onSort ? (
                <button className="th-sort" onClick={() => onSort(c.id)}>
                  {c.label}
                  {sortMark(sort, c.id)}
                </button>
              ) : (
                c.label
              )}
            </th>
          ))}
          {trailing && <th className="act" />}
        </tr>
      </thead>
      {groups.map(g => (
        <Body key={String(g.playing)} playing={g.playing}>
          {g.rows.map(draw)}
          {lineAfter !== null && g.playing && (
            <tr className="line" aria-hidden>
              <td colSpan={columns.length + 2} />
            </tr>
          )}
        </Body>
      ))}
    </table>
  );
}

function PlayerRow({
  row,
  columns,
  leading,
  trailing,
  payment,
  playedGame,
}: {
  row: GameRow;
  columns: Column[];
  leading?: (row: GameRow) => ReactNode;
  trailing?: (row: GameRow) => ReactNode;
  payment?: (row: GameRow) => ReactNode;
  playedGame: boolean;
}) {
  const out = playedGame ? row.played === false : !row.inLine;
  return (
    <tr
      className={cls(out && 'out', row.sub && 'sub')}
      data-testid="player-row"
      data-name={row.name}
    >
      {leading?.(row)}
      {columns.map(c => (
        <td
          key={c.id}
          className={cls(c.numeric && 'n', c.collapsesOnPhone && 'hide-sm')}
        >
          {cell(c.id, row, columns, payment)}
        </td>
      ))}
      {trailing && <td className="act">{trailing(row)}</td>}
    </tr>
  );
}

const cell = (
  column: ColumnId,
  row: GameRow,
  columns: Column[],
  payment?: (row: GameRow) => ReactNode
): ReactNode => {
  switch (column) {
    case 'position':
      return row.position ?? '';
    case 'arrival':
      return row.arrival ?? '';
    case 'player':
      return (
        <>
          {row.sub ? '↳ ' : ''}
          {row.name}
          {row.labels.map(l => (
            <span key={l} className="tag">
              {l}
            </span>
          ))}
          <PhoneLine row={row} columns={columns} />
        </>
      );
    case 'points':
      return row.points === null ? '' : fmtPoints(row.points);
    case 'played':
      return row.played === null ? '' : row.played ? 'Sí' : 'No';
    case 'team':
      return <TeamChip row={row} />;
    case 'payment':
      return payment?.(row) ?? null;
  }
};

const TeamChip = ({ row }: { row: GameRow }) =>
  row.team ? (
    <span className={`chip ${row.team}`}>{TEAM_LABEL[row.team]}</span>
  ) : row.played === null ? null : (
    <>–</>
  );

/** On a phone the narrow columns live in a second line under the name. */
const PhoneLine = ({ row, columns }: { row: GameRow; columns: Column[] }) => {
  const shown = new Set(columns.filter(c => c.collapsesOnPhone).map(c => c.id));
  const parts = [
    shown.has('arrival') && row.arrival !== null && `Llegada ${row.arrival}`,
    shown.has('points') &&
      row.points !== null &&
      `${fmtPoints(row.points)} pts`,
    shown.has('team') && row.team && TEAM_LABEL[row.team],
  ].filter(Boolean);
  return parts.length ? (
    <span className="phone-line">{parts.join(' · ')}</span>
  ) : null;
};

const sortMark = (sort: Sort | null, column: ColumnId) =>
  sort?.column === column ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ' ↕';

const cls = (...names: Array<string | false | undefined>) =>
  names.filter(Boolean).join(' ') || undefined;
