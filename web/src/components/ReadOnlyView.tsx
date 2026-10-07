import { columnsFor } from '../lib/columns';
import type { GameTable } from '../lib/gameRows';
import { GameLayout } from './GameLayout';
import { PlayersTable } from './PlayersTable';

/** A cancelled game: the table of the state it was cancelled from, nothing to act on. */
export function ReadOnlyView({ table }: { table: GameTable }) {
  return (
    <div className="cancelled-view">
      <GameLayout
        title="Jugadores · el partido está cancelado"
        count={table.rows.length}
        main={<PlayersTable table={table} columns={columnsFor(table.state)} />}
      />
    </div>
  );
}
