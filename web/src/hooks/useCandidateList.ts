import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type CandidateLine,
  type CandidateRow,
  type ResolveAction,
  type UnresolvedEntry,
} from '../api';
import {
  hasUnsavedChanges,
  rowLines,
  withIntroduced,
  withLink,
} from '../lib/candidateDraft';

/**
 * A game's candidate list as the organiser edits it: a draft on screen that
 * only becomes the game's list when `save` is called.
 */
export function useCandidateList(
  gameId: number,
  seasonId: number,
  onSaved: () => void,
  onEnrolled: () => void
) {
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [savedLines, setSavedLines] = useState<CandidateLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Runs one action, reporting whether it worked. */
  const guard = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    api
      .candidateRows(gameId)
      .then(saved => {
        if (!live) return;
        setRows(saved);
        setSavedLines(rowLines(saved));
        setLoaded(true);
      })
      .catch(e => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [gameId]);

  const add = useCallback(
    (paste: string) =>
      guard(async () => {
        setRows(await api.previewCandidates(gameId, rowLines(rows), paste));
      }),
    [gameId, guard, rows]
  );

  const remove = useCallback(
    (position: number) =>
      guard(async () => {
        const kept = rows.filter(r => r.position !== position);
        setRows(await api.previewCandidates(gameId, rowLines(kept)));
      }),
    [gameId, guard, rows]
  );

  const clear = useCallback(() => setRows([]), []);

  const save = useCallback(
    () =>
      guard(async () => {
        const saved = await api.saveCandidates(gameId, rowLines(rows));
        setRows(saved);
        setSavedLines(rowLines(saved));
        onSaved();
      }),
    [gameId, guard, onSaved, rows]
  );

  /** Records how many seasons a first-time player has, then reads the draft again. */
  const confirmSeniority = useCallback(
    (playerId: number, seasons: number) =>
      guard(async () => {
        await api.confirmSeniority(seasonId, playerId, seasons);
        setRows(await api.previewCandidates(gameId, rowLines(rows)));
        onEnrolled();
      }),
    [gameId, guard, onEnrolled, rows, seasonId]
  );

  const resolve = useCallback(
    (entry: UnresolvedEntry, action: ResolveAction) =>
      guard(async () => {
        // Choosing a player just for this line is a link kept on the line;
        // an alias or a new player is a change to the players themselves.
        if (action.type === 'link') {
          setRows(
            await api.previewCandidates(
              gameId,
              withLink(rows, entry, action.playerId)
            )
          );
          return;
        }
        const result = await api.resolveCandidate(gameId, entry, action);
        if (result.outcome === 'resolved') {
          // A new name written with a host is that host's guest, and only
          // the line that registered them says so.
          const lines =
            action.type === 'register' &&
            entry.field === 'name' &&
            entry.line.kind === 'hostAnnotated'
              ? withIntroduced(rows, entry)
              : rowLines(rows);
          setRows(await api.previewCandidates(gameId, lines));
          return;
        }
        setRows(list =>
          list.map(r =>
            r.status === 'unresolved' && r.entry === entry
              ? { ...r, entry: result.entry }
              : r
          )
        );
      }),
    [gameId, guard, rows]
  );

  return {
    rows,
    loaded,
    busy,
    error,
    unsaved: hasUnsavedChanges(rows, savedLines),
    add,
    remove,
    clear,
    save,
    resolve,
    confirmSeniority,
  };
}
