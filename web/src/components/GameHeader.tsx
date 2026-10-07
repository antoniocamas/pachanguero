import { RecordPastGame } from './RecordPastGame';
import { DeleteGame } from './DeleteGame';
import { fmtDate } from '../lib/dates';
import { euros } from '../lib/money';
import type { Game } from '../api';

/** The "Partido" card: game picker, record/delete controls and the four counters. */
export function GameHeader({
  games,
  gameId,
  gameLabel,
  slots,
  signedCount,
  paidCount,
  owedCents,
  onSelect,
  onRecorded,
  onDeleted,
}: {
  games: Game[];
  gameId: number | null;
  gameLabel: string;
  slots: number;
  signedCount: number;
  paidCount: number;
  owedCents: number;
  onSelect: (id: number | null) => void;
  onRecorded: (game: Game) => void;
  onDeleted: () => void;
}) {
  return (
    <div className="card">
      <h2>Partido</h2>
      <RecordPastGame onRecorded={onRecorded} />
      <div style={{ padding: '12px 14px' }}>
        <select
          value={gameId ?? ''}
          onChange={e =>
            onSelect(e.target.value ? Number(e.target.value) : null)
          }
          aria-label="Elegir partido"
        >
          {gameId === null && (
            <option value="">
              {games.length === 0
                ? 'Sin partidos todavía'
                : 'Elige un partido…'}
            </option>
          )}
          {[...games].reverse().map(g => (
            <option key={g.id} value={g.id}>
              {fmtDate(g.played_on)}
              {g.label ? ` (${g.label})` : ''}
              {g.status === 'cancelled' ? ' — cancelado' : ''}
            </option>
          ))}
        </select>
      </div>
      {gameId === null && (
        <div className="empty">
          Ningún partido pendiente. Elige uno de la lista o registra el de hoy
          por su fecha.
        </div>
      )}
      {gameId && (
        <DeleteGame gameId={gameId} label={gameLabel} onDeleted={onDeleted} />
      )}
      <div className="stat-row">
        <div className="stat">
          <b>{signedCount}</b>
          <span>apuntados</span>
        </div>
        <div className="stat">
          <b style={{ color: signedCount > slots ? 'var(--warn)' : undefined }}>
            {slots}
          </b>
          <span>plazas</span>
        </div>
        <div className="stat">
          <b>{paidCount}</b>
          <span>pagados</span>
        </div>
        <div className="stat">
          <b style={{ color: owedCents ? 'var(--danger)' : undefined }}>
            {euros(owedCents)}
          </b>
          <span>deuda €</span>
        </div>
      </div>
    </div>
  );
}
