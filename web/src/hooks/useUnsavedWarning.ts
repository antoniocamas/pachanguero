import { useEffect } from 'react';

/** Asks the browser to confirm before the page is left or reloaded with unsaved work. */
export function useUnsavedWarning(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
}
