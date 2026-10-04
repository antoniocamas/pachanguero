export interface Season {
  id: number;
  name: string;
  starts_on: string;
  ends_on: string;
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
}

export type Team = 'claros' | 'oscuros';

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
  team: Team | null;
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

export type ParsedLine =
  | { position: number; kind: 'plain'; name: string }
  | { position: number; kind: 'hostAnnotated'; name: string; hostName: string }
  | { position: number; kind: 'plusOne'; hostName: string };

export interface UnresolvedEntry {
  line: ParsedLine;
  field: 'name' | 'host';
  reason: 'unmatched' | 'ambiguous' | 'collision';
  candidates: { id: number; name: string }[];
}

export interface MatchedCandidate {
  position: number;
  playerId: number | null;
  name: string | null;
  hostPlayerId: number | null;
  guest: 'named' | 'anonymous' | null;
  seniorityPrompt?: true;
  suggested?: number;
}

/** Who the organiser said a line's name, or the host it names, is. */
export interface CandidateLinks {
  name?: number;
  host?: number;
}

/** One line of a candidate list as sent to the server. */
export interface CandidateLine {
  text: string;
  links?: CandidateLinks;
  /** This line registered the name as its host's guest. */
  introduced?: true;
}

/** One line of a game's candidate list and what the known players make of it. */
export type CandidateRow =
  | {
      position: number;
      text: string;
      links?: CandidateLinks;
      introduced?: true;
      status: 'matched';
      candidate: MatchedCandidate;
    }
  | {
      position: number;
      text: string;
      links?: CandidateLinks;
      introduced?: true;
      status: 'unresolved';
      entry: UnresolvedEntry;
    };

export type ResolveAction =
  | { type: 'link'; playerId: number }
  | { type: 'linkAsAlias'; playerId: number }
  | { type: 'register'; name: string; introducedBy?: number };

export type ResolveResult =
  { outcome: 'resolved' } | { outcome: 'unresolved'; entry: UnresolvedEntry };

export interface FinalUnresolved extends UnresolvedEntry {
  team: Team;
}

export interface FinalParticipant {
  position: number;
  team: Team;
  playerId: number;
  name: string;
  companions: number;
  paidCents: number;
  seniorityPrompt?: true;
  suggested?: number;
}

export interface FinalPasteResult {
  game: Game;
  matched: FinalParticipant[];
  unresolved: FinalUnresolved[];
}

export type FinalResolveResult =
  | { outcome: 'resolved'; participant: FinalParticipant }
  | { outcome: 'unresolved'; entry: FinalUnresolved };

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
  createSeason: (data: { name: string }) =>
    call<Season>('/seasons', { method: 'POST', body: body(data) }),
  updateSeason: (id: number, patch: Partial<Season>) =>
    call<Season>(`/seasons/${id}`, { method: 'PATCH', body: body(patch) }),
  currentSeason: () => call<Season | null>('/seasons/current'),

  players: (seasonId: number) => call<Player[]>(`/seasons/${seasonId}/players`),
  knownPlayers: () => call<Pick<Player, 'id' | 'name'>[]>('/players'),
  addPlayer: (seasonId: number, name: string, seasons: number) =>
    call<Player>(`/seasons/${seasonId}/players`, {
      method: 'POST',
      body: body({ name, seasons }),
    }),
  updatePlayer: (
    seasonId: number,
    playerId: number,
    patch: { seasons?: number }
  ) =>
    call<{ ok: true }>(`/seasons/${seasonId}/players/${playerId}`, {
      method: 'PATCH',
      body: body(patch),
    }),

  games: (seasonId: number) => call<Game[]>(`/seasons/${seasonId}/games`),
  createGame: (played_on: string, label?: string) =>
    call<Game>('/games', {
      method: 'POST',
      body: body({ played_on, label }),
    }),
  deleteGame: (gameId: number) =>
    call<{ ok: true }>(`/games/${gameId}`, { method: 'DELETE' }),
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
    }>
  ) =>
    call<Participation[]>(`/games/${gameId}/players/${playerId}`, {
      method: 'PUT',
      body: body(patch),
    }),

  /** The saved candidate list of a game. */
  candidateRows: (gameId: number) =>
    call<{ rows: CandidateRow[] }>(`/games/${gameId}/candidates`).then(
      r => r.rows
    ),
  /** The list with `paste` added to it; nothing is stored. */
  previewCandidates: (gameId: number, lines: CandidateLine[], paste = '') =>
    call<{ rows: CandidateRow[] }>(`/games/${gameId}/candidates/preview`, {
      method: 'POST',
      body: body({ lines, paste }),
    }).then(r => r.rows),
  /** Makes this list the game's: the lines, the sign-ups and the guests. */
  saveCandidates: (gameId: number, lines: CandidateLine[]) =>
    call<{ rows: CandidateRow[] }>(`/games/${gameId}/candidates`, {
      method: 'PUT',
      body: body({ lines }),
    }).then(r => r.rows),
  resolveCandidate: (
    gameId: number,
    entry: Pick<UnresolvedEntry, 'line' | 'field'>,
    action: ResolveAction
  ) =>
    call<ResolveResult>(`/games/${gameId}/candidates/resolve`, {
      method: 'POST',
      body: body({ ...entry, action }),
    }),

  pasteFinalList: (text: string, gameId?: number) =>
    call<FinalPasteResult>('/games/final:paste', {
      method: 'POST',
      body: body({ text, gameId }),
    }),
  resolveFinalLine: (
    gameId: number,
    entry: Pick<FinalUnresolved, 'line' | 'field' | 'team'>,
    action: ResolveAction
  ) =>
    call<FinalResolveResult>(`/games/${gameId}/final/resolve`, {
      method: 'POST',
      body: body({ ...entry, action }),
    }),
  confirmSeniority: (seasonId: number, playerId: number, seasons: number) =>
    call<Player>(`/seasons/${seasonId}/players/${playerId}/seniority`, {
      method: 'POST',
      body: body({ seasons }),
    }),

  standings: (seasonId: number) =>
    call<Standing[]>(`/seasons/${seasonId}/standings`),
  preview: (gameId: number) =>
    call<ConvocatoriaResult>(`/games/${gameId}/convocatoria/preview`),
  commit: (gameId: number) =>
    call<ConvocatoriaResult>(`/games/${gameId}/convocatoria`, {
      method: 'POST',
    }),
};
