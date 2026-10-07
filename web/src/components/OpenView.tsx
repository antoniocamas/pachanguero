import type { Player } from '../api';
import { columnsFor } from '../lib/columns';
import type { GameTable } from '../lib/gameRows';
import { CandidateList } from './CandidateList';
import { GameLayout } from './GameLayout';
import { PlayersTable } from './PlayersTable';

/** An open game: who signed up, in the order they arrived, beside the list being edited. */
export function OpenView({
  table,
  gameId,
  seasonId,
  gameLabel,
  players,
  onChanged,
  onEnrolled,
}: {
  table: GameTable;
  gameId: number;
  seasonId: number;
  gameLabel: string;
  players: Pick<Player, 'id' | 'name'>[];
  onChanged: () => void;
  onEnrolled: () => void;
}) {
  return (
    <GameLayout
      title="Jugadores · por orden de llegada"
      count={table.rows.length}
      main={<PlayersTable table={table} columns={columnsFor(table.state)} />}
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
