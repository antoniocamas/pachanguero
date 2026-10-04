import { useState } from 'react';
import type { CandidateRow, Player } from '../api';
import { useCandidateList } from '../hooks/useCandidateList';
import { useUnsavedWarning } from '../hooks/useUnsavedWarning';
import { ResolveLine } from './ResolveLine';
import { SeniorityPrompt } from './SeniorityPrompt';

/** What to show for a matched row: the player, or the pasted text for a nameless +1. */
const label = (row: Extract<CandidateRow, { status: 'matched' }>) =>
  row.candidate.guest === 'anonymous'
    ? row.text
    : (row.candidate.name ?? row.text);

/**
 * A game's list of candidates, in the order it was pasted. Pasting adds to it,
 * names can be removed or settled, and nothing counts until "Guardar lista".
 */
export function CandidateList({
  gameId,
  seasonId,
  gameLabel,
  players,
  onChanged,
  onEnrolled,
}: {
  gameId: number;
  /** The season the game belongs to, whose seniority is asked for. */
  seasonId: number;
  /** The game this list belongs to, so it is never a mystery. */
  gameLabel: string;
  players: Pick<Player, 'id' | 'name'>[];
  /** Called once the list is saved, so sign-ups elsewhere refresh. */
  onChanged: () => void;
  /** Called when a first-time player is enrolled, so the season's players refresh. */
  onEnrolled: () => void;
}) {
  const [text, setText] = useState('');
  const list = useCandidateList(gameId, seasonId, onChanged, onEnrolled);
  useUnsavedWarning(list.unsaved);

  const add = async () => {
    if (await list.add(text)) setText('');
  };
  const clear = () => {
    if (window.confirm('¿Vaciar toda la lista?')) list.clear();
  };

  return (
    <div className="card">
      <h2>
        Lista de apuntados
        <span className="right muted">{gameLabel}</span>
      </h2>
      {list.error && <div className="err">{list.error}</div>}
      <div style={{ padding: '12px 14px' }}>
        <textarea
          aria-label="Añadir jugadores"
          rows={5}
          style={{ width: '100%' }}
          placeholder="Pega aquí la lista de WhatsApp, o escribe un nombre"
          value={text}
          onChange={e => setText(e.target.value)}
        />
      </div>
      <div className="actions">
        <button
          className="btn"
          disabled={list.busy || !text.trim()}
          onClick={add}
        >
          Añadir a la lista
        </button>
      </div>

      <h2>
        En la lista
        <span className="right muted">{list.rows.length}</span>
      </h2>
      {list.loaded && list.rows.length === 0 && (
        <div className="empty">Todavía no hay nadie en la lista.</div>
      )}
      {list.rows.map(row => {
        const asksSeniority =
          row.status === 'matched' &&
          row.candidate.seniorityPrompt &&
          row.candidate.playerId !== null &&
          row.candidate.suggested !== undefined;
        const remove = (
          <button
            className="btn"
            aria-label={`Quitar ${row.text}`}
            disabled={list.busy}
            onClick={() => list.remove(row.position)}
          >
            Quitar
          </button>
        );
        return (
          <div key={row.position} data-testid="candidate-row">
            <div className="row">
              <span className="pos">{row.position}</span>
              {row.status === 'matched' ? (
                <>
                  <span className="name" data-testid="matched-line">
                    {label(row)}
                  </span>
                  {row.candidate.guest && <span className="tag">invitado</span>}
                </>
              ) : (
                <div style={{ flex: 1 }}>
                  <ResolveLine
                    entry={row.entry}
                    players={players}
                    busy={list.busy}
                    onResolve={action => list.resolve(row.entry, action)}
                  />
                </div>
              )}
              {/* A row waiting for seniority has its Quitar beside Confirmar. */}
              {!asksSeniority && remove}
            </div>
            {row.status === 'matched' && asksSeniority && (
              <SeniorityPrompt
                name={label(row)}
                suggested={row.candidate.suggested!}
                busy={list.busy}
                onConfirm={seasons =>
                  list.confirmSeniority(row.candidate.playerId!, seasons)
                }
                extra={remove}
              />
            )}
          </div>
        );
      })}

      <div className="actions">
        <button
          className="btn primary"
          disabled={list.busy || !list.unsaved}
          onClick={list.save}
        >
          Guardar lista
        </button>
        <button
          className="btn"
          disabled={list.busy || list.rows.length === 0}
          onClick={clear}
        >
          Vaciar lista
        </button>
        {list.unsaved && (
          <span className="muted" role="status">
            Cambios sin guardar
          </span>
        )}
      </div>
    </div>
  );
}
