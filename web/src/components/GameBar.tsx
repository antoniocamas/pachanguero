import { useState } from 'react';
import { fmtDate } from '../lib/dates';
import { euros } from '../lib/money';
import type { Counters } from '../lib/counters';
import { gameMenuItems, type GameMenuItem } from '../lib/gameMenu';
import { useDeleteGame } from '../hooks/useDeleteGame';
import type { Game, GameState } from '../api';
import { GameMenu } from './GameMenu';
import { NextAction, type NextActions } from './NextAction';
import { RecordPastGame } from './RecordPastGame';
import { StateSteps } from './StateSteps';

export type GameBarActions = NextActions & { reopen: () => void };

/**
 * The bar that stays in view: which game, its state, its counters and the one
 * next step. What is done now and then (a new game, going back, cancelling,
 * deleting) is in its "more actions" menu.
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
  report,
}: {
  games: Game[];
  gameId: number | null;
  gameLabel: string;
  state: GameState | null;
  nextAction: string | null;
  counters: Counters | null;
  busy: boolean;
  actions: GameBarActions;
  onSelect: (id: number | null) => void;
  onCancel: () => void;
  onRecorded: (game: Game) => void;
  onDeleted: () => void;
  report: (message: string | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const deletion = useDeleteGame(gameId, gameLabel, onDeleted, report);

  const at = games.findIndex(g => g.id === gameId);
  const older = at > 0 ? games[at - 1] : null;
  const newer = at >= 0 && at < games.length - 1 ? games[at + 1] : null;

  const menuAction: Record<GameMenuItem, () => void> = {
    new: () => setRecording(true),
    recreate: actions.create,
    reopen: actions.reopen,
    cancel: onCancel,
    delete: () => void deletion.remove(),
  };

  return (
    <div className="bar" data-testid="game-bar">
      <div className="row1">
        <button
          className="btn nav-game"
          aria-label="Partido anterior"
          disabled={!older}
          onClick={() => older && onSelect(older.id)}
        >
          ‹
        </button>
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
        <button
          className="btn nav-game"
          aria-label="Partido siguiente"
          disabled={!newer}
          onClick={() => newer && onSelect(newer.id)}
        >
          ›
        </button>
        <span className="sp" />
        <GameMenu
          items={gameMenuItems(state)}
          busy={busy || deletion.busy}
          onSelect={item => menuAction[item]()}
        />
      </div>
      {recording && (
        <div className="record-wrap">
          <RecordPastGame
            onRecorded={game => {
              setRecording(false);
              onRecorded(game);
            }}
          />
          <button className="btn link" onClick={() => setRecording(false)}>
            Cerrar
          </button>
        </div>
      )}
      {gameId === null && (
        <div className="empty">
          Ningún partido pendiente. Elige uno de la lista o registra el de hoy
          por su fecha.
        </div>
      )}
      {gameId && state && (
        <>
          <div className="row2">
            <StateSteps state={state} />
            {counters && <CounterRow counters={counters} />}
          </div>
          <NextAction
            state={state}
            label={nextAction}
            busy={busy}
            actions={actions}
          />
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
