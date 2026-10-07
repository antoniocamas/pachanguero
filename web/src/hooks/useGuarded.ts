import { useCallback, useState } from 'react';

/**
 * Runs one action at a time, turning a failure into a message for the
 * organiser instead of an unhandled rejection. Reports whether it worked.
 */
export function useGuarded(report: (message: string | null) => void) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      try {
        await action();
        report(null);
        return true;
      } catch (e) {
        report((e as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [report]
  );

  return { busy, run };
}
