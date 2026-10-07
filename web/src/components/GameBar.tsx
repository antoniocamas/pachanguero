import { useState } from 'react';
import { fmtDate } from '../lib/dates';
import { euros } from '../lib/money';
import type { Counters } from '../lib/counters';
import type { Game, GameState } from '../api';
import { DeleteGame } from './DeleteGame';
import { NextAction, type NextActions } from './NextAction';
import { RecordPastGame } from './RecordPastGame';
import { StateSteps } from './StateSteps';

/**
 * The bar that stays in view: which game, its counters, its state and what to
 * do next. Registering and deleting games live here too.
 */
export function GameBar({
  games,
  gameId,
  gameLabel,
  state,
  nextAction,
  counters,
  busy,
  actions,
  onSelect,
  onCancel,
  onRecorded,
  onDeleted,
}: {
  games: Game[];
  gameId: number | null;
  gameLabel: string;
  state: GameState | null;
  nextAction: string | null;
  counters: Counters | null;
  busy: boolean;
  actions: NextActions;
  onSelect: (id: number | null) => void;
  onCancel: () => void;
  onRecorded: (game: Game) => void;
  onDeleted: () => void;
}) {
  const [recording, setRecording] = useState(false);

  return (
    <div className="bar" data-testid="game-bar">
      <div className="row1">
        <select
          className="sel"
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
        <button className="btn" onClick={() => setRecording(r => !r)}>
          + Nuevo
        </button>
        <span className="sp" />
        {counters && <CounterRow counters={counters} />}
        {gameId && state !== 'cancelled' && (
          <button className="btn link" disabled={busy} onClick={onCancel}>
            Cancelar partido
          </button>
        )}
      </div>
      {recording && <RecordPastGame onRecorded={onRecorded} />}
      {gameId === null && (
        <div className="empty">
          Ningún partido pendiente. Elige uno de la lista o registra el de hoy
          por su fecha.
        </div>
      )}
      {gameId && state && (
        <>
          <StateSteps state={state} />
          <NextAction
            state={state}
            label={nextAction}
            busy={busy}
            actions={actions}
          />
          <DeleteGame gameId={gameId} label={gameLabel} onDeleted={onDeleted} />
        </>
      )}
    </div>
  );
}

function CounterRow({ counters }: { counters: Counters }) {
  const item = (id: string, value: string, label: string) => (
    <span data-testid={`counter-${id}`}>
      <b>{value}</b> {label}
    </span>
  );
  return (
    <div className="counters">
      {item('apuntados', String(counters.apuntados), 'apuntados')}
      {item('plazas', String(counters.plazas), 'plazas')}
      {item('pagados', String(counters.pagados), 'pagados')}
      {item('deuda', euros(counters.deudaCents), 'deuda')}
    </div>
  );
}
