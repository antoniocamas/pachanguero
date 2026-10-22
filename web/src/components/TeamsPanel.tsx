import { useState } from 'react';
import type { Player, Team, TeamMember } from '../api';
import { TEAM_LABEL } from '../lib/format';
import { ResolveLine } from './ResolveLine';
import type { useTeamsPaste } from '../hooks/useTeamsPaste';

type Paste = ReturnType<typeof useTeamsPaste>;

const TEAMS: Team[] = ['claros', 'oscuros'];

/** The team's names, a guest's with who brought them: "Adri (de David)". */
const names = (
  members: TeamMember[],
  team: Team,
  guestOf: ReadonlyMap<number, string>
) =>
  members
    .filter(m => m.team === team)
    .map(m =>
      guestOf.has(m.playerId)
        ? `${m.name} (de ${guestOf.get(m.playerId)})`
        : m.name
    );

/**
 * Pasting the two teams is optional and records only who was on which side;
 * a name that is not in the convocatoria or not recognised is kept as text.
 */
export function TeamsPanel({
  paste,
  players,
  guestOf = new Map(),
}: {
  paste: Paste;
  players: Pick<Player, 'id' | 'name'>[];
  /** Who brought each named guest, by name. */
  guestOf?: ReadonlyMap<number, string>;
}) {
  const [text, setText] = useState('');
  const { result } = paste;

  return (
    <div className="side">
      <p className="muted">
        Opcional: pega los dos equipos para guardarlos. No hace falta para
        registrar los pagos.
      </p>
      <textarea
        aria-label="Equipos pegados"
        rows={8}
        placeholder={'Claros\n-----\n…\n\nOscuros\n-----\n…'}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <button
        className="btn primary"
        disabled={paste.busy || !text.trim()}
        onClick={() => paste.paste(text)}
      >
        Registrar equipos
      </button>

      {result &&
        TEAMS.map(team => (
          <div key={team} data-testid={`team-${team}`}>
            <b>{TEAM_LABEL[team]}</b>{' '}
            <span className="muted">
              {names(result.matched, team, guestOf).length}
            </span>
            <div>{names(result.matched, team, guestOf).join(', ')}</div>
          </div>
        ))}
      {result && result.outside.length > 0 && (
        <div className="muted" data-testid="team-outside">
          Sin equipo (no estaban en la convocatoria):{' '}
          {result.outside.map(m => m.name).join(', ')}
        </div>
      )}
      {result && result.ignored.length > 0 && (
        <div className="muted">
          Ignorados: {result.ignored.map(i => i.text).join(', ')}
        </div>
      )}
      {result?.unresolved.map(entry => (
        <div key={`${entry.line.position}-${entry.field}`} className="unres">
          <ResolveLine
            entry={entry}
            players={players}
            busy={paste.busy}
            allowRegister={false}
            onResolve={action => paste.resolve(entry, action)}
          />
        </div>
      ))}
    </div>
  );
}
