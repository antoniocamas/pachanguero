import type { Game } from '../api';

/**
 * The game the page opens on: the next one that has not happened yet, else the
 * latest one still waiting for its final list. Never simply "the last game" —
 * that would quietly aim a paste at a long-finished game. `null` means the
 * organiser has to choose or register one.
 */
export function pickDefaultGame(games: Game[], today: string): Game | null {
  const upcoming = games.find(
    g => g.played_on >= today && g.status !== 'cancelled'
  );
  if (upcoming) return upcoming;
  const waiting = games.filter(
    g => g.status !== 'played' && g.status !== 'cancelled'
  );
  return waiting[waiting.length - 1] ?? null;
}
