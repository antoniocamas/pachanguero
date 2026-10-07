import type { MemberKey, Player } from '../api';
import { columnsFor } from '../lib/columns';
import type { GameRow, GameTable } from '../lib/gameRows';
import { CandidateList } from './CandidateList';
import { GameLayout } from './GameLayout';
import { DragHandle, DropZone, MemberDnd } from './MemberDnd';
import { PlayersTable } from './PlayersTable';

/**
 * A game with its convocatoria created or confirmed: the line after the last
 * place can be crossed by dragging a row or with its Meter / Sacar button.
 */
export function LineView({
  table,
  busy,
  gameId,
  seasonId,
  gameLabel,
  players,
  onMove,
  onChanged,
  onEnrolled,
}: {
  table: GameTable;
  busy: boolean;
  gameId: number;
  seasonId: number;
  gameLabel: string;
  players: Pick<Player, 'id' | 'name'>[];
  onMove: (member: MemberKey, playing: boolean) => void;
  onChanged: () => void;
  onEnrolled: () => void;
}) {
  return (
    <GameLayout
      title="Jugadores · por orden de convocatoria · arrastra una fila para cambiarla de lado"
      count={table.rows.length}
      main={
        <MemberDnd onMove={onMove}>
          <PlayersTable
            table={table}
            columns={columnsFor(table.state)}
            Body={DropZone}
            leading={(row: GameRow) => (
              <DragHandle
                id={row.id}
                member={row.key}
                playing={row.inLine}
                label={row.name}
              />
            )}
            trailing={(row: GameRow) => (
              <button
                className="btn mini"
                disabled={busy}
                aria-label={`${row.inLine ? 'Sacar' : 'Meter'} a ${row.name}`}
                onClick={() => onMove(row.key, !row.inLine)}
              >
                {row.inLine ? 'Sacar' : 'Meter'}
              </button>
            )}
          />
        </MemberDnd>
      }
      sideTab="Apuntados"
      side={
        <CandidateList
          key={gameId}
          gameId={gameId}
          seasonId={seasonId}
          gameLabel={gameLabel}
          players={players}
          onChanged={onChanged}
          onEnrolled={onEnrolled}
        />
      }
    />
  );
}
