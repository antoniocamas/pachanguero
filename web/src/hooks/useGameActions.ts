import { useCallback } from 'react';
import { api, type GameAction, type MemberKey } from '../api';
import { useGuarded } from './useGuarded';

const DISCARD = 'Se perderán tus correcciones';

/** What the organiser does to the game: move it along, and correct the convocatoria. */
export function useGameActions(
  gameId: number | null,
  reload: () => Promise<void>,
  report: (message: string | null) => void,
  onStateChanged: () => void,
  ask: (question: string) => boolean = window.confirm.bind(window)
) {
  const { busy, run } = useGuarded(report);

  const afterChange = useCallback(async () => {
    await reload();
    onStateChanged();
  }, [reload, onStateChanged]);

  const transition = useCallback(
    (action: GameAction) =>
      run(async () => {
        await api.transition(gameId!, action);
        await afterChange();
      }),
    [gameId, run, afterChange]
  );

  /** Creates the convocatoria; recreating over hand corrections asks first. */
  const create = useCallback(
    () =>
      run(async () => {
        try {
          await api.createConvocatoria(gameId!);
        } catch (e) {
          if ((e as Error).message !== DISCARD) throw e;
          if (!ask(`${DISCARD}. ¿Crearla de nuevo?`)) return;
          await api.createConvocatoria(gameId!, true);
        }
        await afterChange();
      }),
    [gameId, run, afterChange, ask]
  );

  const confirm = useCallback(
    () =>
      run(async () => {
        await api.confirmConvocatoria(gameId!);
        await afterChange();
      }),
    [gameId, run, afterChange]
  );

  const move = useCallback(
    (member: MemberKey, playing: boolean) =>
      run(async () => {
        await api.moveMember(gameId!, member, playing);
        await reload();
      }),
    [gameId, run, reload]
  );

  return { busy, transition, create, confirm, move };
}
