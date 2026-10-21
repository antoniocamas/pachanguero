import type { MemberKey, Player } from '../api';
import { useTeamsPaste } from '../hooks/useTeamsPaste';
import { columnsFor } from '../lib/columns';
import type { GameRow, GameTable } from '../lib/gameRows';
import { CandidateList } from './CandidateList';
import { GameLayout } from './GameLayout';
import { DragHandle, DropZone, MemberDnd } from './MemberDnd';
import { PlayersTable } from './PlayersTable';
import { TeamsPanel } from './TeamsPanel';

/**
 * A game with its convocatoria created or confirmed: the line after the last
 * place can be crossed by dragging a row or with its Meter / Sacar button.
 * Once confirmed, the two teams can be declared before the game is played.
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
  report,
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
  report: (message: string | null) => void;
}) {
  const teams = useTeamsPaste(gameId, onChanged, report);
  const confirmed = table.state === 'convocatoria_confirmed';
  return (
    <GameLayout
      title="Jugadores · orden de convocatoria"
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
      mainTab="Convocados"
      sides={[
        {
          label: 'Apuntados',
          content: (
            <CandidateList
              key={gameId}
              gameId={gameId}
              seasonId={seasonId}
              gameLabel={gameLabel}
              players={players}
              onChanged={onChanged}
              onEnrolled={onEnrolled}
            />
          ),
        },
        ...(confirmed
          ? [
              {
                label: 'Equipos',
                content: (
                  <div className="card">
                    <h2>
                      Equipos<small>opcional</small>
                    </h2>
                    <TeamsPanel paste={teams} players={players} />
                  </div>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}
