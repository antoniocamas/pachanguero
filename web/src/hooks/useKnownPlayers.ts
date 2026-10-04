import { useEffect, useState } from 'react';
import { api, type Player } from '../api';

/**
 * Every player ever registered, whatever season they are enrolled in: the
 * pool a pasted name can be linked to. Reloads when `reloadKey` changes.
 */
export function useKnownPlayers(reloadKey: unknown) {
  const [players, setPlayers] = useState<Pick<Player, 'id' | 'name'>[]>([]);
  useEffect(() => {
    let live = true;
    api
      .knownPlayers()
      .then(rows => live && setPlayers(rows))
      .catch(() => live && setPlayers([]));
    return () => {
      live = false;
    };
  }, [reloadKey]);
  return players;
}
