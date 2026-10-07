import { useMemo, useState } from 'react';
import type { GameDetail, Player } from '../api';
import { useTeamsPaste } from '../hooks/useTeamsPaste';
import { usePayments } from '../hooks/usePayments';
import { columnsFor, sortRows, toggleSort, type Sort } from '../lib/columns';
import type { GameRow, GameTable } from '../lib/gameRows';
import { paymentCell } from '../lib/paymentCell';
import { GameLayout } from './GameLayout';
import { PaymentCell } from './PaymentCell';
import { PlayersTable } from './PlayersTable';
import { TeamsPanel } from './TeamsPanel';

/**
 * A played game: payments per share (or an adjusted amount, or undone) and
 * the optional paste of the two teams. Sortable by any column.
 */
export function PlayedView({
  detail,
  table,
  players,
  reload,
  report,
}: {
  detail: GameDetail;
  table: GameTable;
  players: Pick<Player, 'id' | 'name'>[];
  reload: () => Promise<void>;
  report: (message: string | null) => void;
}) {
  const [sort, setSort] = useState<Sort | null>(null);
  const payments = usePayments(detail.game.id, reload, report);
  const teams = useTeamsPaste(detail.game.id, () => void reload(), report);
  const names = useMemo(
    () => new Map(players.map(p => [p.id, p.name])),
    [players]
  );
  const shown = useMemo(
    () => (sort ? { ...table, rows: sortRows(table.rows, sort) } : table),
    [table, sort]
  );

  return (
    <GameLayout
      title={
        sort
          ? 'Jugadores'
          : 'Jugadores · primero los que deben, luego alfabético'
      }
      count={table.rows.filter(r => !r.sub).length}
      main={
        <PlayersTable
          table={shown}
          columns={columnsFor(table.state)}
          sort={sort}
          onSort={column => setSort(current => toggleSort(current, column))}
          payment={(row: GameRow) => (
            <PaymentCell
              parts={paymentCell(row, detail.debts, detail.payments, names)}
              busy={payments.busy}
              onPay={payments.pay}
              onUndo={payments.undo}
            />
          )}
        />
      }
      sideTab="Equipos"
      side={
        <div className="card">
          <h2>
            Equipos<small>opcional</small>
          </h2>
          <TeamsPanel paste={teams} players={players} />
        </div>
      }
    />
  );
}
