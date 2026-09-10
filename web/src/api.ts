export interface Season {
  id: number;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: number;
  price_cents: number;
  slots: number;
  mercy_seats: number;
  games_out_for_mercy: number;
  mercy_resets_counter: number;
  demotion_direction: 'bottom-up' | 'top-down';
}

export interface Player {
  id: number;
  name: string;
  seasons: number;
  active: number;
}

export interface Game {
  id: number;
  season_id: number;
  played_on: string;
  label: string | null;
  status: 'scheduled' | 'played' | 'cancelled';
  notes: string | null;
}

export interface Participation {
  game_id: number;
  player_id: number;
  name: string;
  signed_up: number;
  played: number;
  paid_cents: number;
  paid_on: string | null;
  guests: number;
  note: string | null;
}

export interface Standing {
  playerId: number;
  name: string;
  seasons: number;
  paidGames: number;
  exclusions: number;
  seniority: number;
  points: number;
  gamesPlayed: number;
  debtCents: number;
}

export type Outcome = 'called_up' | 'mercy' | 'demoted' | 'excluded';

export interface ConvocatoriaEntry {
  playerId: number;
  name: string;
  points: number;
  position: number;
  outcome: Outcome;
  waitCounter: number;
  playing: boolean;
}

export interface ConvocatoriaResult {
  entries: ConvocatoriaEntry[];
  swaps: Array<{ promoted: number; demoted: number }>;
  oversubscribed: boolean;
  game: Game;
}

export interface GameDetail {
  game: Game;
  participations: Participation[];
  convocatoria: {
    id: number;
    rules: unknown;
    created_at: string;
    entries: Array<{
      player_id: number;
      name: string;
      position: number;
      points: number;
      wait_counter: number;
      outcome: Outcome;
      playing: number;
    }>;
  } | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const body = (data: unknown) => JSON.stringify(data);

export const api = {
  seasons: () => call<Season[]>('/seasons'),
  createSeason: (data: { name: string; starts_on?: string }) =>
    call<Season>('/seasons', { method: 'POST', body: body(data) }),
  updateSeason: (id: number, patch: Partial<Season>) =>
    call<Season>(`/seasons/${id}`, { method: 'PATCH', body: body(patch) }),
  activateSeason: (id: number) => call<Season>(`/seasons/${id}/activate`, { method: 'POST' }),

  players: (seasonId: number) => call<Player[]>(`/seasons/${seasonId}/players`),
  addPlayer: (seasonId: number, name: string, seasons: number) =>
    call<Player>(`/seasons/${seasonId}/players`, { method: 'POST', body: body({ name, seasons }) }),
  updatePlayer: (seasonId: number, playerId: number, patch: { seasons?: number; active?: boolean }) =>
    call<{ ok: true }>(`/seasons/${seasonId}/players/${playerId}`, {
      method: 'PATCH',
      body: body(patch),
    }),

  games: (seasonId: number) => call<Game[]>(`/seasons/${seasonId}/games`),
  createGame: (seasonId: number, played_on: string, label?: string) =>
    call<Game>(`/seasons/${seasonId}/games`, { method: 'POST', body: body({ played_on, label }) }),
  game: (gameId: number) => call<GameDetail>(`/games/${gameId}`),
  updateGame: (gameId: number, patch: Partial<Game>) =>
    call<Game>(`/games/${gameId}`, { method: 'PATCH', body: body(patch) }),

  setParticipation: (
    gameId: number,
    playerId: number,
    patch: Partial<{
      signed_up: boolean;
      played: boolean;
      paid_cents: number;
      paid_on: string | null;
      guests: number;
    }>,
  ) => call<Participation[]>(`/games/${gameId}/players/${playerId}`, { method: 'PUT', body: body(patch) }),

  standings: (seasonId: number) => call<Standing[]>(`/seasons/${seasonId}/standings`),
  preview: (gameId: number) => call<ConvocatoriaResult>(`/games/${gameId}/convocatoria/preview`),
  commit: (gameId: number) => call<ConvocatoriaResult>(`/games/${gameId}/convocatoria`, { method: 'POST' }),
};
