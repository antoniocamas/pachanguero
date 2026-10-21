import { useMemo, useState } from 'react';
import type { SettledBizum } from '../api';
import {
  filterSettled,
  groupByMonth,
  paidPlayers,
  sortSettled,
  type SettledFilter,
  type SettledSort,
} from '../lib/settledBizums';
import {
  amountText,
  bookedText,
  senderText,
  settledHowText,
  settledLines,
} from '../lib/waitingBizums';

const HOWS: Array<{ id: SettledFilter['how']; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'automatic', label: 'Automático' },
  { id: 'organiser', label: 'Decidido por ti' },
];

/**
 * The Bizums already settled, each with the games it paid: what a Bizum became is read here,
 * not guessed from the payments. Sorted by date, and searchable by anything in them: the name
 * the bank showed, the player it paid for, the subject, the amount or a date.
 */
export function SettledBizums({ settled }: { settled: SettledBizum[] }) {
  const [text, setText] = useState('');
  const [how, setHow] = useState<SettledFilter['how']>('all');
  const [sort, setSort] = useState<SettledSort>('newest');

  const shown = useMemo(
    () => sortSettled(filterSettled(settled, { text, how }), sort),
    [settled, text, how, sort]
  );
  const groups = useMemo(() => groupByMonth(shown), [shown]);

  return (
    <div className="card" data-testid="settled-bizums">
      <div className="settled-tools">
        <input
          type="search"
          aria-label="Buscar en los Bizums liquidados"
          placeholder="Buscar nombre, jugador, asunto, importe…"
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <div className="settled-filters">
          {HOWS.map(h => (
            <button
              key={h.id}
              className="chip"
              data-on={how === h.id}
              aria-pressed={how === h.id}
              onClick={() => setHow(h.id)}
            >
              {h.label}
            </button>
          ))}
          <button
            className="btn mini sort"
            onClick={() => setSort(s => (s === 'newest' ? 'oldest' : 'newest'))}
          >
            {sort === 'newest' ? 'Más recientes ↓' : 'Más antiguos ↑'}
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="empty">
          {settled.length === 0
            ? 'Ningún Bizum liquidado todavía.'
            : 'Ningún Bizum con esos filtros.'}
        </div>
      ) : (
        groups.map(group => (
          <section key={group.heading}>
            <h3 className="month">{group.heading}</h3>
            {group.items.map(item => (
              <SettledItem key={item.id} item={item} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function SettledItem({ item }: { item: SettledBizum }) {
  const players = paidPlayers(item);
  return (
    <div className="waiting-item" data-testid="settled-bizum">
      <div className="row">
        <span className="name">
          <strong>{senderText(item.sender)}</strong>{' '}
          <span className="muted">{bookedText(item)}</span>
          {players.length > 0 && (
            <span className="tag holder"> = {players.join(', ')}</span>
          )}
        </span>
        <span className="right">{amountText(item)}</span>
      </div>
      <div className="muted">{settledHowText(item.settledHow)}</div>
      {settledLines(item).map(line => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}
