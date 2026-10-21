import {
  CAREFUL_ITEMS,
  GAME_MENU_LABEL,
  type GameMenuItem,
} from '../lib/gameMenu';
import { ActionMenu } from './ActionMenu';

/**
 * The "more actions" menu of a game: what is done now and then (a new game,
 * going back a step, cancelling, deleting) stays out of the way of the next
 * step.
 */
export function GameMenu({
  items,
  busy,
  onSelect,
}: {
  items: readonly GameMenuItem[];
  busy: boolean;
  onSelect: (item: GameMenuItem) => void;
}) {
  return (
    <ActionMenu
      label="Más acciones"
      busy={busy}
      onSelect={onSelect}
      items={items.map(id => ({
        id,
        label: GAME_MENU_LABEL[id],
        careful: CAREFUL_ITEMS.includes(id),
      }))}
    />
  );
}
