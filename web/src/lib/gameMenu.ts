import type { GameState } from '../api';

/** What the game's "more actions" menu can offer: the exceptional moves. */
export type GameMenuItem = 'new' | 'recreate' | 'reopen' | 'cancel' | 'delete';

export const GAME_MENU_LABEL: Record<GameMenuItem, string> = {
  new: 'Nuevo partido',
  recreate: 'Crear la convocatoria de nuevo',
  reopen: 'Reabrir partido',
  cancel: 'Cancelar partido',
  delete: 'Borrar este partido',
};

/** The items that ask for care and go under their own heading. */
export const CAREFUL_ITEMS: readonly GameMenuItem[] = ['cancel', 'delete'];

/** The items the menu shows for a game in `state` (none of the game's own when there is no game). */
export const gameMenuItems = (state: GameState | null): GameMenuItem[] => {
  const items: GameMenuItem[] = ['new'];
  if (state === 'convocatoria_created' || state === 'convocatoria_confirmed')
    items.push('recreate');
  if (state === 'played') items.push('reopen');
  if (state !== null && state !== 'cancelled') items.push('cancel');
  if (state !== null) items.push('delete');
  return items;
};
