import { useState, type ReactNode } from 'react';

/**
 * The players next to a side panel on a desktop; on a phone one at a time,
 * chosen with the two tabs above them.
 */
export function GameLayout({
  title,
  count,
  main,
  sideTab,
  side,
}: {
  title: string;
  count: number;
  main: ReactNode;
  /** The phone tab that opens the side panel. */
  sideTab?: string;
  side?: ReactNode;
}) {
  const [tab, setTab] = useState<'main' | 'side'>('main');
  return (
    <>
      {side && (
        <div className="game-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'main'}
            onClick={() => setTab('main')}
          >
            Jugadores
          </button>
          <button
            role="tab"
            aria-selected={tab === 'side'}
            onClick={() => setTab('side')}
          >
            {sideTab}
          </button>
        </div>
      )}
      <div className="game-grid" data-tab={tab}>
        <div className="card p1">
          <h2>
            {title}
            <small>{count} jugadores</small>
          </h2>
          <div className="scroll">{main}</div>
        </div>
        {side && <div className="p2">{side}</div>}
      </div>
    </>
  );
}
