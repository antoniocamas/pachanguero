import { useCallback } from 'react';
import { api } from '../api';
import { useGuarded } from './useGuarded';

/** Removes a game with everything recorded on it, after asking. */
export function useDeleteGame(
  gameId: number | null,
  label: string,
  onDeleted: () => void,
  report: (message: string | null) => void
) {
  const { busy, run } = useGuarded(report);

  const remove = useCallback(async () => {
    if (gameId === null) return;
    if (
      !confirm(
        `¿Borrar el partido del ${label}? Se pierden sus apuntados, la convocatoria, los pagos y las exclusiones.`
      )
    )
      return;
    await run(async () => {
      await api.deleteGame(gameId);
      onDeleted();
    });
  }, [gameId, label, onDeleted, run]);

  return { busy, remove };
}
