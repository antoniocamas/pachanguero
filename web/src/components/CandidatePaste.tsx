import { useState } from 'react';
import type { MatchedCandidate, Player } from '../api';
import { useCandidatePaste } from '../hooks/useCandidatePaste';
import { ResolveLine } from './ResolveLine';

const describe = (m: MatchedCandidate) =>
  m.guest === 'anonymous' ? '+1 (invitado)' : (m.name ?? '');

/** Paste the WhatsApp list; matched names sign up, the rest wait for the organiser. */
export function CandidatePaste({
  gameId,
  players,
  onChanged,
}: {
  gameId: number;
  players: Pick<Player, 'id' | 'name'>[];
  onChanged: () => void;
}) {
  const [text, setText] = useState('');
  const { matched, unresolved, submitted, busy, error, paste, resolve } =
    useCandidatePaste(gameId, onChanged);

  return (
    <div className="card">
      <h2>Lista de apuntados</h2>
      {error && <div className="err">{error}</div>}
      <div style={{ padding: '12px 14px' }}>
        <textarea
          aria-label="Lista pegada"
          rows={8}
          style={{ width: '100%' }}
          placeholder="Pega aquí la lista de WhatsApp"
          value={text}
          onChange={e => setText(e.target.value)}
        />
      </div>
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy || !text.trim()}
          onClick={() => paste(text)}
        >
          Procesar lista
        </button>
      </div>

      {submitted && (
        <>
          <h2>
            Reconocidos
            <span className="right muted">{matched.length}</span>
          </h2>
          {matched.length === 0 && (
            <div className="empty">Ninguno todavía.</div>
          )}
          {matched.map(m => (
            <div key={m.position} className="row" data-testid="matched-line">
              <span className="pos">{m.position}</span>
              <span className="name">{describe(m)}</span>
              {m.guest === 'named' && <span className="tag">invitado</span>}
            </div>
          ))}

          {unresolved.length > 0 && (
            <>
              <h2>
                Sin resolver
                <span className="right muted">{unresolved.length}</span>
              </h2>
              {unresolved.map(entry => (
                <ResolveLine
                  key={`${entry.line.position}-${entry.field}-${entry.reason}`}
                  entry={entry}
                  players={players}
                  busy={busy}
                  onResolve={action => resolve(entry, action)}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
