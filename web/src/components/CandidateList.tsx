import { useState } from 'react';
import type { CandidateRow, Player, UnresolvedEntry } from '../api';
import { fmtPoints } from '../lib/format';
import type { GameRow } from '../lib/gameRows';
import { useCandidateList } from '../hooks/useCandidateList';
import { useUnsavedWarning } from '../hooks/useUnsavedWarning';
import { ResolveDialog } from './ResolveDialog';
import { ResolveLine } from './ResolveLine';
import { SeniorityPrompt } from './SeniorityPrompt';

/** What to show for a matched row: the player, or the pasted text for a nameless +1. */
const label = (row: Extract<CandidateRow, { status: 'matched' }>) =>
  row.candidate.guest === 'anonymous'
    ? row.text
    : (row.candidate.name ?? row.text);

/** The names of a matched line that can be corrected: the player's and the host's. */
const correctable = (
  row: Extract<CandidateRow, { status: 'matched' }>
): UnresolvedEntry[] =>
  (['name', 'host'] as const)
    .filter(field =>
      field === 'name' ? row.line.kind !== 'plusOne' : row.line.kind !== 'plain'
    )
    .map(field => ({
      line: row.line,
      field,
      reason: 'correction' as const,
      candidates: [],
    }));

/**
 * A game's list of candidates, in the order it was pasted. Pasting adds to it,
 * names can be removed or settled, and nothing counts until "Guardar lista".
 */
export function CandidateList({
  gameId,
  seasonId,
  gameLabel,
  players,
  known = [],
  onChanged,
  onEnrolled,
}: {
  gameId: number;
  /** The season the game belongs to, whose seniority is asked for. */
  seasonId: number;
  /** The game this list belongs to, so it is never a mystery. */
  gameLabel: string;
  players: Pick<Player, 'id' | 'name'>[];
  /** The saved sign-ups, whose arrival and points are shown beside a matched name. */
  known?: GameRow[];
  /** Called once the list is saved, so sign-ups elsewhere refresh. */
  onChanged: () => void;
  /** Called when a first-time player is enrolled, so the season's players refresh. */
  onEnrolled: () => void;
}) {
  const [text, setText] = useState('');
  // The dialog opens after a paste, never just because the page was opened.
  const [asking, setAsking] = useState(false);
  // The matched row whose name is being corrected.
  const [correcting, setCorrecting] = useState<number | null>(null);
  const list = useCandidateList(gameId, seasonId, onChanged, onEnrolled);
  useUnsavedWarning(list.unsaved);

  const add = async () => {
    if (await list.add(text)) {
      setText('');
      setAsking(true);
    }
  };
  const unresolved = list.rows.flatMap(row =>
    row.status === 'matched' ? [] : [row]
  );
  const clear = () => {
    if (window.confirm('¿Vaciar toda la lista?')) list.clear();
  };

  const standing = (row: Extract<CandidateRow, { status: 'matched' }>) => {
    const saved = known.find(
      k => k.playerId !== null && k.playerId === row.candidate.playerId
    );
    return saved?.arrival != null && saved.points !== null
      ? `Llegada ${saved.arrival} · ${fmtPoints(saved.points)} pts`
      : null;
  };

  return (
    <div className="card candidate-card">
      <h2>
        Apuntados
        <span className="right muted">
          {list.unsaved && (
            <>
              <span role="status">Cambios sin guardar</span> ·{' '}
            </>
          )}
          {list.rows.length} jugadores · {gameLabel}
        </span>
      </h2>
      {list.error && <div className="err">{list.error}</div>}
      <div className="paste">
        <textarea
          aria-label="Añadir jugadores"
          rows={3}
          placeholder="Pega aquí la lista de WhatsApp, o escribe un nombre"
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <button
          className="btn"
          disabled={list.busy || !text.trim()}
          onClick={add}
        >
          Añadir a la lista
        </button>
      </div>

      {list.loaded && list.rows.length === 0 && (
        <div className="empty">Todavía no hay nadie en la lista.</div>
      )}
      {unresolved.length > 0 && (
        <div className="actions">
          <span className="muted">{unresolved.length} sin reconocer</span>
          <button className="btn primary" onClick={() => setAsking(true)}>
            Resolver nombres
          </button>
        </div>
      )}
      <ResolveDialog
        open={unresolved.length > 0 && asking}
        title={`Nombres sin reconocer (${unresolved.length})`}
        onClose={() => setAsking(false)}
      >
        {unresolved.map(row => (
          <div key={row.position} className="resolve-item">
            <ResolveLine
              entry={row.entry}
              players={players}
              busy={list.busy}
              onResolve={action => list.resolve(row.entry, action)}
            />
            <button
              className="btn"
              aria-label={`Quitar ${row.text}`}
              disabled={list.busy}
              onClick={() => list.remove(row.position)}
            >
              Quitar de la lista
            </button>
          </div>
        ))}
      </ResolveDialog>
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
        const modify =
          row.status === 'matched' ? (
            <button
              className="btn"
              aria-label={`Modificar ${row.text}`}
              aria-expanded={correcting === row.position}
              disabled={list.busy}
              onClick={() =>
                setCorrecting(correcting === row.position ? null : row.position)
              }
            >
              Modificar
            </button>
          ) : null;
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
                  <span className="muted phone-line-inline">
                    {standing(row)}
                  </span>
                </>
              ) : (
                <>
                  <span className="name">{row.text}</span>
                  <span className="tag">sin reconocer</span>
                </>
              )}
              {/* A row waiting for seniority has its Quitar beside Confirmar. */}
              {!asksSeniority && modify}
              {!asksSeniority && remove}
            </div>
            {row.status === 'matched' && correcting === row.position && (
              <div className="resolve-item">
                {correctable(row).map(entry => (
                  <ResolveLine
                    key={entry.field}
                    entry={entry}
                    players={players}
                    busy={list.busy}
                    onResolve={async action => {
                      if (await list.resolve(entry, action))
                        setCorrecting(null);
                    }}
                  />
                ))}
              </div>
            )}
            {row.status === 'matched' && asksSeniority && (
              <SeniorityPrompt
                name={label(row)}
                suggested={row.candidate.suggested!}
                busy={list.busy}
                onConfirm={seasons =>
                  list.confirmSeniority(row.candidate.playerId!, seasons)
                }
                extra={
                  <>
                    {modify}
                    {remove}
                  </>
                }
              />
            )}
          </div>
        );
      })}

      <div className="sticky-actions">
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
      </div>
    </div>
  );
}
