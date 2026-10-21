import { useEffect, useRef, useState } from 'react';

export interface ActionMenuItem<Id extends string> {
  id: Id;
  label: string;
  /** Asks for care: shown last, under its own heading, in red. */
  careful?: boolean;
}

/**
 * A "more actions" button that opens a menu: a bottom sheet on a phone, a small
 * modal on a computer. It knows nothing about what the items do.
 */
export function ActionMenu<Id extends string>({
  label,
  items,
  busy = false,
  onSelect,
  className = 'btn menu-btn',
}: {
  /** What the button and the menu are called for assistive technology. */
  label: string;
  items: readonly ActionMenuItem<Id>[];
  busy?: boolean;
  onSelect: (id: Id) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const choose = (id: Id) => {
    setOpen(false);
    onSelect(id);
  };
  const entry = (item: ActionMenuItem<Id>) => (
    <button
      key={item.id}
      className={`menu-item${item.careful ? ' careful' : ''}`}
      disabled={busy}
      onClick={() => choose(item.id)}
    >
      {item.label}
    </button>
  );
  const careful = items.filter(i => i.careful);

  return (
    <>
      <button
        className={className}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        ⋯
      </button>
      <dialog
        ref={ref}
        className="menu-dialog"
        aria-label={label}
        onCancel={() => setOpen(false)}
        onClick={e => {
          if (e.target === ref.current) setOpen(false);
        }}
      >
        <div className="menu-items">
          {items.filter(i => !i.careful).map(entry)}
          {careful.length > 0 && (
            <>
              <div className="menu-heading">Con cuidado</div>
              {careful.map(entry)}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
