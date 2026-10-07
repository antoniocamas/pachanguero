import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal that takes the screen (the whole of it on a phone) for work that
 * needs room, such as settling names the app did not recognise. It knows
 * nothing about what it holds; closing it, by button or Escape, calls `onClose`.
 */
export function ResolveDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="resolve-dialog" onCancel={onClose}>
      <header>
        <h2>{title}</h2>
        <button className="btn" onClick={onClose}>
          Cerrar
        </button>
      </header>
      <div className="resolve-dialog-body">{open && children}</div>
    </dialog>
  );
}
