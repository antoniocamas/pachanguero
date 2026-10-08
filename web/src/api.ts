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

/** A player with everything the organiser can correct about them. */
export interface PlayerDetail {
  id: number;
  name: string;
  introducedBy: number | null;
  aliases: string[];
}

export type Team = 'claros' | 'oscuros';

export interface Game {
  id: number;
  season_id: number;
  played_on: string;
  label: string | null;
  status:
    | 'open'
    | 'convocatoria_created'
    | 'convocatoria_confirmed'
    | 'played'
    | 'cancelled';
  cancelled_from: Exclude<Game['status'], 'cancelled'> | null;
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

export type GameState = Game['status'];

/** A convocatoria member: a player, or the nth '+1' of a host. */
export type MemberKey =
  { playerId: number } | { hostPlayerId: number; ordinal: number };

export interface ConvocatoriaEntry {
  id: number;
  /** null for an anonymous plus-one. */
  player_id: number | null;
  guest_host_player_id: number | null;
  guest_ordinal: number | null;
  name: string;
  changed_by_hand: boolean;
  position: number;
  points: number;
  wait_counter: number;
  outcome: Outcome;
  playing: number;
}

/** A share still owed: who answers for it and whose it is. */
export interface Debt {
  id: number;
  game_id: number;
  holder_player_id: number;
  /** null for an anonymous plus-one, named by its holder and ordinal. */
  beneficiary_player_id: number | null;
  guest_ordinal: number | null;
  amount_cents: number;
}

/** A share settled: who paid it, how much and when. */
export interface Payment extends Debt {
  payer_player_id: number;
  paid_on: string;
}

/** A matched line of the saved candidate list, in the order it arrived. */
export interface Arrival {
  position: number;
  playerId: number | null;
  hostPlayerId: number | null;
  guest: 'named' | 'anonymous' | null;
  text: string;
}

export interface GameDetail {
  game: Game;
  state: GameState;
  nextAction: string | null;
  participations: Participation[];
  convocatoria: {
    id: number;
    rules: unknown;
    created_at: string;
    confirmed_at: string | null;
    source: 'generated' | 'history';
    entries: ConvocatoriaEntry[];
  } | null;
  debts: Debt[];
  payments: Payment[];
  arrivals: Arrival[];
  /** Each player's points as of this game, by player id. */
  points: Record<number, number>;
}

export type ParsedLine =
  | { position: number; kind: 'plain'; name: string }
  | { position: number; kind: 'hostAnnotated'; name: string; hostName: string }
  | { position: number; kind: 'plusOne'; hostName: string };

export interface UnresolvedEntry {
  line: ParsedLine;
  field: 'name' | 'host';
  /** 'correction' is only ever made on screen, for a name that matched but is wrong. */
  reason: 'unmatched' | 'ambiguous' | 'collision' | 'duplicate' | 'correction';
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
      line: ParsedLine;
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
  | { outcome: 'resolved'; playerId: number }
  | { outcome: 'unresolved'; entry: UnresolvedEntry };

export interface TeamUnresolved extends UnresolvedEntry {
  team: Team;
}

export interface TeamMember {
  position: number;
  team: Team;
  playerId: number;
  name: string;
}

export interface TeamPasteResult {
  matched: TeamMember[];
  outside: TeamMember[];
  unresolved: TeamUnresolved[];
  ignored: Array<{ position: number; team: Team; text: string }>;
}

export type TeamResolveResult =
  | { outcome: 'assigned'; member: TeamMember }
  | { outcome: 'unresolved'; entry: TeamUnresolved };

export type GameAction = 'play' | 'reopen' | 'cancel' | 'uncancel';

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
  missingSeason: () => call<{ name: string } | null>('/seasons/missing'),
  currentSeason: () => call<Season | null>('/seasons/current'),

  players: (seasonId: number) => call<Player[]>(`/seasons/${seasonId}/players`),
  knownPlayers: () => call<Pick<Player, 'id' | 'name'>[]>('/players'),
  playerDetails: () => call<PlayerDetail[]>('/players/details'),
  editPlayer: (
    playerId: number,
    patch: {
      name?: string;
      introducedBy?: number | null;
      keepOldAsAlias?: boolean;
    }
  ) =>
    call<PlayerDetail>(`/players/${playerId}`, {
      method: 'PATCH',
      body: body(patch),
    }),
  /** Folds `from` into `playerId`: they are the same person. */
  mergePlayers: (playerId: number, from: number) =>
    call<{ ok: true }>(`/players/${playerId}/merge`, {
      method: 'POST',
      body: body({ from }),
    }),
  addAlias: (playerId: number, alias: string) =>
    call<{ playerId: number; alias: string }>(`/players/${playerId}/aliases`, {
      method: 'POST',
      body: body({ alias }),
    }),
  removeAlias: (playerId: number, alias: string) =>
    call<{ ok: true }>(
      `/players/${playerId}/aliases/${encodeURIComponent(alias)}`,
      { method: 'DELETE' }
    ),
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

  pasteTeams: (gameId: number, text: string) =>
    call<TeamPasteResult>(`/games/${gameId}/teams/paste`, {
      method: 'POST',
      body: body({ text }),
    }),
  resolveTeamLine: (
    gameId: number,
    entry: Pick<TeamUnresolved, 'line' | 'field' | 'team'>,
    action: ResolveAction
  ) =>
    call<TeamResolveResult>(`/games/${gameId}/teams/paste/resolve`, {
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

  /** Moves a game along its lifecycle (play, reopen, cancel, undo cancelling). */
  transition: (gameId: number, action: GameAction) =>
    call<{ state: GameState }>(`/games/${gameId}/state`, {
      method: 'POST',
      body: body({ action }),
    }),
  /** Creates the convocatoria, or recreates it, which discards hand corrections only when told to. */
  createConvocatoria: (gameId: number, discardEdits = false) =>
    call<{ game: Game }>(`/games/${gameId}/convocatoria`, {
      method: 'POST',
      body: body({ discardEdits }),
    }),
  confirmConvocatoria: (gameId: number) =>
    call<unknown>(`/games/${gameId}/convocatoria/confirm`, { method: 'POST' }),
  /** Puts a member in or out of the playing line. */
  moveMember: (gameId: number, member: MemberKey, playing: boolean) =>
    call<unknown>(`/games/${gameId}/convocatoria/members`, {
      method: 'PUT',
      body: body({ member, playing }),
    }),

  /** Settles shares; the payer is whoever hands over the money. */
  pay: (
    gameId: number,
    request: {
      shares: MemberKey[];
      payerPlayerId: number;
      amountCents?: number;
    }
  ) =>
    call<{ debts: Debt[]; payments: Payment[] }>(`/games/${gameId}/payments`, {
      method: 'POST',
      body: body(request),
    }),
  undoPayment: (gameId: number, paymentId: number) =>
    call<{ debts: Debt[]; payments: Payment[] }>(
      `/games/${gameId}/payments/${paymentId}`,
      { method: 'DELETE' }
    ),
};
