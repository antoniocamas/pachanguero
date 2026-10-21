import { useEffect, useRef, useState } from 'react';
import {
  CAREFUL_ITEMS,
  GAME_MENU_LABEL,
  type GameMenuItem,
} from '../lib/gameMenu';

/**
 * The "more actions" menu of a game: what is done now and then (a new game,
 * going back a step, cancelling, deleting) stays out of the way of the next
 * step. A bottom sheet on a phone, a small modal on a computer.
 */
export function GameMenu({
  items,
  busy,
  onSelect,
}: {
  items: readonly GameMenuItem[];
  busy: boolean;
  onSelect: (item: GameMenuItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const choose = (item: GameMenuItem) => {
    setOpen(false);
    onSelect(item);
  };
  const entry = (item: GameMenuItem) => (
    <button
      key={item}
      className={`menu-item${CAREFUL_ITEMS.includes(item) ? ' careful' : ''}`}
      disabled={busy}
      onClick={() => choose(item)}
    >
      {GAME_MENU_LABEL[item]}
    </button>
  );

  return (
    <>
      <button
        className="btn menu-btn"
        aria-label="Más acciones"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        ⋯
      </button>
      <dialog
        ref={ref}
        className="menu-dialog"
        aria-label="Más acciones del partido"
        onCancel={() => setOpen(false)}
        onClick={e => {
          if (e.target === ref.current) setOpen(false);
        }}
      >
        <div className="menu-items">
          {items.filter(i => !CAREFUL_ITEMS.includes(i)).map(entry)}
          {items.some(i => CAREFUL_ITEMS.includes(i)) && (
            <>
              <div className="menu-heading">Con cuidado</div>
              {items.filter(i => CAREFUL_ITEMS.includes(i)).map(entry)}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
