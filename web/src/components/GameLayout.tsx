import { useState, type ReactNode } from 'react';

/** One panel beside the players, with the label of the tab that opens it. */
export interface SidePanel {
  label: string;
  content: ReactNode;
}

const MAIN = -1;

/**
 * The players next to their side panels on a computer; on a phone one at a
 * time, chosen with a tab each. The panels stay mounted when hidden, so
 * what is typed in one is still there when coming back to it.
 */
export function GameLayout({
  title,
  count,
  main,
  mainTab = 'Jugadores',
  sides = [],
}: {
  title: string;
  count: number;
  main: ReactNode;
  /** The tab that opens the players on a phone. */
  mainTab?: string;
  sides?: SidePanel[];
}) {
  const [tab, setTab] = useState(MAIN);
  // On a computer the players are always in view: a side panel is always chosen.
  const side = Math.max(tab, 0);
  const button = (index: number, label: string, selected: boolean) => (
    <button
      key={label}
      role="tab"
      aria-selected={selected}
      onClick={() => setTab(index)}
    >
      {label}
    </button>
  );

  return (
    <>
      {sides.length > 0 && (
        <div className="game-tabs" role="tablist">
          {button(MAIN, mainTab, tab === MAIN)}
          {sides.map((s, i) => button(i, s.label, tab === i))}
        </div>
      )}
      <div className="game-grid" data-tab={tab === MAIN ? 'main' : 'side'}>
        <div className="card p1">
          <h2>
            {title}
            <small>{count} jugadores</small>
          </h2>
          <div className="scroll">{main}</div>
        </div>
        {sides.length > 0 && (
          <div className="p2">
            {sides.length > 1 && (
              <div className="side-tabs" role="tablist">
                {sides.map((s, i) => button(i, s.label, side === i))}
              </div>
            )}
            {sides.map((s, i) => (
              <div key={s.label} hidden={i !== side}>
                {s.content}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
