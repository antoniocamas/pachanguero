import { useCallback, useState } from 'react';
import {
  api,
  type ResolveAction,
  type TeamMember,
  type TeamPasteResult,
  type TeamUnresolved,
} from '../api';
import { useGuarded } from './useGuarded';

/** One paste of the teams: where each line went, and what still needs the organiser. */
export function useTeamsPaste(
  gameId: number,
  onChanged: () => void,
  report: (message: string | null) => void
) {
  const { busy, run } = useGuarded(report);
  const [result, setResult] = useState<TeamPasteResult | null>(null);

  const paste = useCallback(
    (text: string) =>
      run(async () => {
        setResult(await api.pasteTeams(gameId, text));
        onChanged();
      }),
    [gameId, run, onChanged]
  );

  const resolve = useCallback(
    (entry: TeamUnresolved, action: ResolveAction) =>
      run(async () => {
        const settled = await api.resolveTeamLine(gameId, entry, action);
        setResult(current => current && withSettled(current, entry, settled));
        if (settled.outcome === 'assigned') onChanged();
      }),
    [gameId, run, onChanged]
  );

  return { busy, result, paste, resolve };
}

/** The paste result once one unresolved line has been settled (or has changed). */
const withSettled = (
  result: TeamPasteResult,
  entry: TeamUnresolved,
  settled:
    | { outcome: 'assigned'; member: TeamMember }
    | { outcome: 'unresolved'; entry: TeamUnresolved }
): TeamPasteResult => ({
  ...result,
  matched:
    settled.outcome === 'assigned'
      ? [...result.matched, settled.member]
      : result.matched,
  unresolved: result.unresolved.flatMap(e =>
    e !== entry ? [e] : settled.outcome === 'unresolved' ? [settled.entry] : []
  ),
});
