import { useState } from 'react';
import type { FinalParticipant, Player, Team } from '../api';
import { useFinalListPaste } from '../hooks/useFinalListPaste';
import { ResolveLine } from './ResolveLine';
import { SeniorityPrompt } from './SeniorityPrompt';

const TEAM_LABEL: Record<Team, string> = {
  claros: 'Claros',
  oscuros: 'Oscuros',
};

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

/** Teams in the order the pasted headings came, which is the order of the first player of each. */
const groupByTeam = (matched: FinalParticipant[]) => {
  const order: Team[] = [];
  for (const m of matched) if (!order.includes(m.team)) order.push(m.team);
  return order.map(team => ({
    team,
    players: matched.filter(m => m.team === team),
  }));
};

/** Paste the post-game list with its two teams: this is what records who played and paid. */
export function FinalListPaste({
  gameId,
  gameLabel,
  seasonId,
  players,
  onChanged,
}: {
  gameId: number;
  /** The game this paste is recorded on, so it is never a mystery. */
  gameLabel: string;
  seasonId: number;
  players: Pick<Player, 'id' | 'name'>[];
  onChanged: () => void;
}) {
  const [text, setText] = useState('');
  const {
    matched,
    unresolved,
    submitted,
    busy,
    error,
    paste,
    resolve,
    confirmSeniority,
  } = useFinalListPaste(gameId, seasonId, onChanged);

  return (
    <div className="card">
      <h2>
        Lista final
        <span className="right muted">{gameLabel}</span>
      </h2>
      {error && <div className="err">{error}</div>}
      <div style={{ padding: '12px 14px' }}>
        <textarea
          aria-label="Lista final pegada"
          rows={10}
          style={{ width: '100%' }}
          placeholder={'Claros\n-----\n…\n\nOscuros\n-----\n…'}
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
          Registrar lista final
        </button>
      </div>

      {submitted &&
        groupByTeam(matched).map(group => (
          <div key={group.team} data-testid={`team-${group.team}`}>
            <h2>
              {TEAM_LABEL[group.team]}
              <span className="right muted">{group.players.length}</span>
            </h2>
            {group.players.map(m => (
              <div key={m.playerId} data-testid="final-line">
                <div className="row">
                  <span className="pos">{m.position}</span>
                  <span className="name">
                    {m.name}
                    {m.companions > 0 ? ` +${m.companions}` : ''}
                  </span>
                  <span className="pts">{euros(m.paidCents)} €</span>
                </div>
                {m.seniorityPrompt && m.suggested !== undefined && (
                  <SeniorityPrompt
                    name={m.name}
                    suggested={m.suggested}
                    busy={busy}
                    onConfirm={seasons => confirmSeniority(m.playerId, seasons)}
                  />
                )}
              </div>
            ))}
          </div>
        ))}

      {submitted && unresolved.length > 0 && (
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
    </div>
  );
}
