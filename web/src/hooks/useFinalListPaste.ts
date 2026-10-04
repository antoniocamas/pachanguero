import { useCallback, useState } from 'react';
import {
  api,
  type FinalParticipant,
  type FinalUnresolved,
  type ResolveAction,
} from '../api';

/** The state of one final-list paste: who played, and what still needs the organiser. */
export function useFinalListPaste(
  gameId: number,
  seasonId: number,
  onChanged: () => void
) {
  const [matched, setMatched] = useState<FinalParticipant[]>([]);
  const [unresolved, setUnresolved] = useState<FinalUnresolved[]>([]);
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
        const result = await api.pasteFinalList(text, gameId);
        setMatched(result.matched);
        setUnresolved(result.unresolved);
        setSubmitted(true);
        onChanged();
      }),
    [gameId, guard, onChanged]
  );

  const resolve = useCallback(
    (entry: FinalUnresolved, action: ResolveAction) =>
      guard(async () => {
        const result = await api.resolveFinalLine(gameId, entry, action);
        setUnresolved(list =>
          list.flatMap(e => {
            if (e !== entry) return [e];
            return result.outcome === 'unresolved' ? [result.entry] : [];
          })
        );
        if (result.outcome === 'resolved') {
          const p = result.participant;
          setMatched(list =>
            [...list.filter(m => m.playerId !== p.playerId), p].sort(
              (a, b) => a.position - b.position
            )
          );
          onChanged();
        }
      }),
    [gameId, guard, onChanged]
  );

  /** Save a first-time player's seniority; the prompt then goes away. */
  const confirmSeniority = useCallback(
    (playerId: number, seasons: number) =>
      guard(async () => {
        await api.confirmSeniority(seasonId, playerId, seasons);
        setMatched(list =>
          list.map(m =>
            m.playerId === playerId
              ? { ...m, seniorityPrompt: undefined, suggested: undefined }
              : m
          )
        );
        onChanged();
      }),
    [seasonId, guard, onChanged]
  );

  return {
    matched,
    unresolved,
    submitted,
    busy,
    error,
    paste,
    resolve,
    confirmSeniority,
  };
}
