import type { SettledBizum } from '../api';
import {
  amountText,
  bookedText,
  senderText,
  settledHowText,
  settledLines,
} from '../lib/waitingBizums';

/**
 * The Bizums already settled, newest first, each with the games it paid: what a Bizum became is
 * read here, not guessed from the payments. Folded away until opened.
 */
export function SettledBizums({ settled }: { settled: SettledBizum[] }) {
  return (
    <details className="card" data-testid="settled-bizums">
      <summary>
        <h2 style={{ display: 'inline' }}>
          Bizums liquidados <span className="count">{settled.length}</span>
        </h2>
      </summary>
      {settled.length === 0 ? (
        <div className="empty">Ningún Bizum liquidado todavía.</div>
      ) : (
        settled.map(item => (
          <div
            className="waiting-item"
            key={item.id}
            data-testid="settled-bizum"
          >
            <div className="row">
              <span className="name">
                <strong>{senderText(item.sender)}</strong>{' '}
                <span className="muted">{bookedText(item)}</span>
              </span>
              <span className="right">{amountText(item)}</span>
            </div>
            <div className="muted">{settledHowText(item.settledHow)}</div>
            {settledLines(item).map(line => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ))
      )}
    </details>
  );
}
