import { useCallback, useState } from 'react';
import { api } from '../api';
import { ApiError } from '../lib/sessionClient';

/** Changes the password; on success the sessions are over, so `onChanged` leaves the app. */
export function usePasswordChange(onChanged: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const change = useCallback(
    async (current: string, next: string, confirm: string) => {
      setBusy(true);
      setError(null);
      setRules([]);
      try {
        await api.changePassword(current, next, confirm);
      } catch (e) {
        setError((e as Error).message);
        const listed = e instanceof ApiError ? e.extra.rules : undefined;
        setRules(Array.isArray(listed) ? (listed as string[]) : []);
        setBusy(false);
        return;
      }
      await onChanged();
    },
    [onChanged]
  );

  return { error, rules, busy, change };
}
