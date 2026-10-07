import type { Player } from '../api';
import type { GameTable } from '../lib/gameRows';
import { CandidateList } from './CandidateList';

/** An open game: one list of who signed up, edited in place and saved explicitly. */
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
    <CandidateList
      key={gameId}
      gameId={gameId}
      seasonId={seasonId}
      gameLabel={gameLabel}
      players={players}
      known={table.rows}
      onChanged={onChanged}
      onEnrolled={onEnrolled}
    />
  );
}
