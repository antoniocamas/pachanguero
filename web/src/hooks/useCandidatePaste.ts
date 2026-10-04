import { useCallback, useState } from 'react';
import {
  api,
  type CandidatePasteResult,
  type MatchedCandidate,
  type ResolveAction,
  type UnresolvedEntry,
} from '../api';

/** The state of one candidate paste: what matched, what still needs the organiser. */
export function useCandidatePaste(gameId: number, onChanged: () => void) {
  const [matched, setMatched] = useState<MatchedCandidate[]>([]);
  const [unresolved, setUnresolved] = useState<UnresolvedEntry[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const paste = useCallback(
    (text: string) =>
      guard(async () => {
        const result: CandidatePasteResult = await api.pasteCandidates(
          text,
          gameId
        );
        setMatched(result.matched);
        setUnresolved(result.unresolved);
        setSubmitted(true);
        onChanged();
      }),
    [gameId, guard, onChanged]
  );

  const resolve = useCallback(
    (entry: UnresolvedEntry, action: ResolveAction) =>
      guard(async () => {
        const result = await api.resolveCandidate(gameId, entry, action);
        setUnresolved(list =>
          list.flatMap(e => {
            if (e !== entry) return [e];
            return result.outcome === 'unresolved' ? [result.entry] : [];
          })
        );
        if (result.outcome === 'resolved') {
          setMatched(list =>
            [...list, result.candidate].sort((a, b) => a.position - b.position)
          );
          onChanged();
        }
      }),
    [gameId, guard, onChanged]
  );

  return { matched, unresolved, submitted, busy, error, paste, resolve };
}
