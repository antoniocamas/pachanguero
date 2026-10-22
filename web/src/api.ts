import { ApiError, createSessionClient } from './lib/sessionClient';

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

/** What a player is in a season: a fijo competes on points, an invitado comes with a host. */
export type SeasonRole = 'fijo' | 'invitado';

/** One player as the organiser's players table shows them, for one season. */
export interface DirectoryRow {
  id: number;
  name: string;
  aliases: string[];
  introducedBy: number | null;
  role: SeasonRole;
  /** The season has the role written, rather than carried over. */
  roleWritten: boolean;
  /** The usual one first. */
  usualHosts: number[];
  emails: string[];
  phone: string | null;
  bizumNames: string[];
  /** Seniority this season; null before their first appearance in it. */
  seasons: number | null;
  username: string | null;
  played: number;
  asGuest: number;
  lastPlayedOn: string | null;
  owedCents: number;
  createdOn: string;
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

/** A share still owed, with the names and game a report shows. */
export interface OutstandingShare {
  id: number;
  gameId: number;
  playedOn: string;
  gameLabel: string | null;
  holderId: number;
  holderName: string;
  /** null for an anonymous plus-one. */
  beneficiaryId: number | null;
  beneficiaryName: string | null;
  guestOrdinal: number | null;
  amountCents: number;
}

/** Whether a player's own share of a game is settled. */
export type PaymentValue =
  | {
      status: 'paid';
      amountCents: number;
      /** Absent in a player's own report, which carries no ids. */
      payerId?: number;
      /** Absent when the payer is neither the player nor the one who answers for the share. */
      payerName?: string;
      paidOn: string;
    }
  | {
      status: 'owed';
      amountCents: number;
      holderId?: number;
      holderName: string;
    }
  | { status: 'none' };

/** Every game a player played, with what each statistic says about it. */
export interface PlayerReport {
  player: { id: number; name: string };
  games: Array<{
    gameId: number;
    playedOn: string;
    label: string | null;
    seasonId: number;
    season: string;
    /** On the pitch; false when signed up and left out. */
    played: boolean;
    /** By statistic key; see lib/playerStats.ts. */
    stats: Record<string, unknown>;
  }>;
  /** Today's season, which the season stats are about. */
  season: { id: number; name: string } | null;
  /** By statistic key; null where the player has no part in the season. */
  seasonStats: Record<string, unknown>;
  summary: { gamesPlayed: number } & Record<string, unknown>;
}

/** A line of what a player owes: a share they hold, for themselves or for a guest. */
export interface OwnDebtRow {
  gameId: number;
  playedOn: string;
  label: string | null;
  amountCents: number;
  /** Why they owe it: their own share, a guest's they brought, or a share moved to them. */
  kind: 'own' | 'guest' | 'other';
  /** Whose share it is when it is not theirs; absent for an anonymous +1. */
  forName?: string;
}

/** A share another player holds for this one. */
export interface HeldRow {
  gameId: number;
  playedOn: string;
  label: string | null;
  amountCents: number;
  holderName: string;
}

export interface OwnDebts {
  owedCents: number;
  mine: OwnDebtRow[];
  heldByHost: HeldRow[];
}

export interface OwnPaymentRow {
  gameId: number;
  playedOn: string;
  label: string | null;
  amountCents: number;
  paidOn: string;
  /** How it was paid; the player is told nothing else of where the money came from. */
  method: PaymentMethod;
  kind: 'own' | 'guest';
  /** Null when the player paid; a name when the one who answers for the share paid it. */
  paidBy: { name: string } | 'other' | null;
}

export interface Contact {
  emails: string[];
  phone: string | null;
}

/** How a payment was made. */
export type PaymentMethod = 'efectivo' | 'bizum' | 'otro';

/** A share settled: who paid it, how much, when and how. */
export interface Payment extends Debt {
  payer_player_id: number;
  paid_on: string;
  method: PaymentMethod;
}

/** What the organiser may know of a payment and the Bizum behind it. */
export interface PaymentDetail {
  payment: {
    id: number;
    gameId: number;
    playedOn: string;
    amountCents: number;
    paidOn: string;
    method: PaymentMethod;
    payerName: string;
    beneficiaryName: string | null;
  };
  resolved: 'manual' | 'automatic' | 'organiser';
  bizum: null | {
    bookedOn: string;
    sender: { name: string | null; phone: string | null };
    amountCents: number;
    currency: string;
    subject: string | null;
    reference: string;
    unallocatedCents: number;
    payments: {
      id: number;
      gameId: number;
      playedOn: string;
      beneficiaryName: string | null;
      amountCents: number;
    }[];
  };
}

/** A matched line of the saved candidate list, in the order it arrived. */
export interface Arrival {
  position: number;
  playerId: number | null;
  hostPlayerId: number | null;
  /** Who brought a guest, by name. */
  hostName: string | null;
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
  /**
   * 'correction' is only ever made on screen, for a name that matched but is wrong; 'noHost'
   * is an invitado written without a host when none is known for them.
   */
  reason:
    | 'unmatched'
    | 'ambiguous'
    | 'collision'
    | 'duplicate'
    | 'noHost'
    | 'correction';
  candidates: { id: number; name: string }[];
}

export interface MatchedCandidate {
  position: number;
  playerId: number | null;
  name: string | null;
  hostPlayerId: number | null;
  /** Who brought a guest, by name. */
  hostName: string | null;
  guest: 'named' | 'anonymous' | null;
  /** Their role in the game's season; null for a +1. */
  role: SeasonRole | null;
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

/** How a connection to the bank stands; the panel and the banner read it. */
export type ConnectionState = 'connected' | 'reconnect_needed';

/** An account of the connection: only what lets the organiser tell them apart. */
export interface BankAccount {
  stableId: string;
  currency: string;
  /** The bank's own code of the account's type. */
  kind: string;
  last4: string;
}

/** What the last read did, as codes and counts. */
export interface ReadCounts {
  entries: number;
  kept: number;
  discarded: number;
  notBizum: number;
  pending: number;
  unidentified: number;
  known: number;
}

export interface LastRead {
  startedAt: string;
  finishedAt: string;
  /** `ok`, a bank failure code or `internal`. */
  result: string;
  code: string | null;
  counts: ReadCounts;
  rateLimitedUntil: string | null;
  nextAt: string | null;
}

export type ReadingMissing =
  | 'not_connected'
  | 'reconnect_needed'
  | 'no_start_date'
  | 'choose_account'
  | 'no_account_in_currency';

/** The Banco panel: the connection, what is read and how. Never a secret, a state or a session. */
export interface BankPanel {
  setup: { code: string; setting: string }[];
  bank: {
    chosenId: string | null;
    options: { id: string; displayName: string }[];
    editable: boolean;
  };
  canConnect: boolean;
  connection: {
    state: ConnectionState;
    validUntil: string;
    daysLeft: number;
    renewSuggested: boolean;
    reason: string | null;
    accounts: BankAccount[];
  } | null;
  currency: string;
  accounts: (BankAccount & { chosen: boolean })[];
  selection: {
    kind: 'account' | 'choose' | 'none_in_currency' | 'not_connected';
    stableId: string | null;
  };
  startDate: string | null;
  words: { include: string[]; exclude: string[] };
  readiness: { ready: boolean; missing: ReadingMissing[] };
  lastRead: LastRead | null;
}

export interface BankBanner {
  show: boolean;
  state: ConnectionState | 'none';
  daysLeft: number | null;
  canRead: boolean;
}

export interface BankSettingsChange {
  bankId?: string;
  currency?: string;
  accountStableId?: string;
  startDate?: string;
}

/** How a forced read ended: it read, it was refused before it began, or it failed. */
export type ReadAnswer =
  | { kind: 'read'; counts: ReadCounts }
  | {
      kind: 'refused';
      code: 'in_progress' | 'too_soon' | 'rate_limited' | 'not_ready';
      until: string | null;
    }
  | { kind: 'failed'; failure: string; code: string };

/** A player and the name their Bizums show. */
export interface Pairing {
  playerId: number;
  playerName: string;
  bizumName: string;
}

export type WaitReason =
  | {
      code: 'not_enough_debts';
      playerId: number;
      shares: number;
      debts: number;
    }
  | { code: 'include_word'; word: string; wholeShares: boolean }
  | { code: 'sender_unknown' }
  | { code: 'sender_ambiguous'; playerIds: number[] }
  | { code: 'no_season' }
  | { code: 'kept' }
  | { code: 'amounts_differ' }
  | { code: 'undone' };

export type SenderIdentity =
  | { kind: 'player'; playerId: number }
  | { kind: 'ambiguous'; playerIds: number[] }
  | { kind: 'unknown'; suggestions: number[] };

/** A Bizum the rules could not settle with certainty, as the organiser sees it. */
export interface WaitingBizum {
  id: number;
  bookedOn: string;
  amountCents: number;
  currency: string;
  sender: { name: string | null; phone: string | null };
  subject: string | null;
  reason: WaitReason;
  /** Names of every player the reason or the sender mentions. */
  players: Record<number, string>;
  senderIdentity: SenderIdentity;
  /** The dates of the games after its booking that the player owes, when it waits for lack of debts. */
  laterGames: string[];
}

/** A debt a Bizum could pay. */
export interface OpenShare {
  debtId: number;
  gameId: number;
  playedOn: string;
  member: MemberKey;
  holderId: number;
  amountCents: number;
}

/** A debt the organiser may pay with a Bizum, and whether its game came after the Bizum. */
export interface RulableShare extends OpenShare {
  afterBooking: boolean;
  /** Its game belongs to a season before the Bizum's. */
  previousSeason: boolean;
}

/** A Bizum that is settled, and the debts it paid. */
export interface SettledBizum {
  id: number;
  bookedOn: string;
  amountCents: number;
  currency: string;
  sender: { name: string | null; phone: string | null };
  subject: string | null;
  settledHow: 'automatic' | 'organiser';
  unallocatedCents: number;
  /** Earliest game first. */
  payments: {
    paymentId: number;
    gameId: number;
    playedOn: string;
    playerName: string;
    amountCents: number;
  }[];
}

export interface PairResult {
  /** What the player had before, when it was something else. */
  replaced: string | null;
  /** The other players who now hold the same Bizum name or phone. */
  sharedWith: { playerId: number; name: string }[];
  results: {
    bizumId: number;
    status: 'settled' | 'waiting';
    bookedOn: string;
    amountCents: number;
    /** The dates of the games it paid, earliest first. */
    games: string[];
  }[];
  waiting: WaitingBizum[];
}

/** What becomes of the money of a Bizum that no share takes: kept on it unassigned, or dismissed. */
export type RestOfBizum = 'keep' | 'dismiss';

/** In a ruling, how many of another player's own shares the Bizum pays for them. */
export interface SharesFor {
  playerId: number;
  shares: number;
}

export interface Ruling {
  shares: number;
  unallocatedCents: number;
  waiting: WaitingBizum[];
}

export type GameAction = 'play' | 'reopen' | 'cancel' | 'uncancel';

const sessionClient = createSessionClient((input, init) => fetch(input, init));

function call<T>(path: string, init?: RequestInit): Promise<T> {
  return sessionClient.request<T>(path, init);
}

const body = (data: unknown) => JSON.stringify(data);

export const api = {
  login: (username: string, password: string) =>
    sessionClient.login(username, password),
  restore: () => sessionClient.restore(),
  logout: () => sessionClient.logout(),
  onExpired: (listener: () => void) => sessionClient.onExpired(listener),
  switchView: (view: 'admin' | 'regular', playerId?: number) =>
    sessionClient.switchView(view, playerId),

  ownDebts: () => call<OwnDebts>('/me/debts'),
  ownPayments: () => call<OwnPaymentRow[]>('/me/payments'),
  ownReport: () => call<PlayerReport>('/me/report'),
  contact: () => call<Contact>('/me/contact'),
  /** Only the keys given change; an empty text clears a value. */
  saveContact: (patch: Partial<Contact>) =>
    call<Contact>('/me/contact', { method: 'PATCH', body: body(patch) }),
  changePassword: (current: string, next: string, confirm: string) =>
    call<void>('/me/password', {
      method: 'PUT',
      body: body({ current, next, confirm }),
    }),
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
  playerTable: (seasonId: number) =>
    call<DirectoryRow[]>(`/seasons/${seasonId}/players/table`),
  setRole: (seasonId: number, playerId: number, role: SeasonRole) =>
    call<{ ok: true }>(`/seasons/${seasonId}/players/${playerId}/role`, {
      method: 'PUT',
      body: body({ role }),
    }),
  setHosts: (playerId: number, hostIds: number[]) =>
    call<{ ok: true }>(`/players/${playerId}/hosts`, {
      method: 'PUT',
      body: body({ hostIds }),
    }),
  savePlayerContact: (playerId: number, patch: Partial<Contact>) =>
    call<Contact>(`/players/${playerId}/contact`, {
      method: 'PATCH',
      body: body(patch),
    }),
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
  /** Refused for a player with any history or an account. */
  deletePlayer: (playerId: number) =>
    call<{ ok: true }>(`/players/${playerId}`, { method: 'DELETE' }),
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

  playerReport: (playerId: number) =>
    call<PlayerReport>(`/players/${playerId}/report`),

  debts: () => call<OutstandingShare[]>('/debts'),

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
      method: PaymentMethod;
    }
  ) =>
    call<{ debts: Debt[]; payments: Payment[] }>(`/games/${gameId}/payments`, {
      method: 'POST',
      body: body(request),
    }),
  paymentDetail: (paymentId: number) =>
    call<PaymentDetail>(`/payments/${paymentId}/bizum`),
  /** Someone else answers for a share from now on. */
  reassignDebt: (gameId: number, debtId: number, holderPlayerId: number) =>
    call<{ debts: Debt[]; payments: Payment[] }>(
      `/games/${gameId}/debts/${debtId}`,
      { method: 'PATCH', body: body({ holderPlayerId }) }
    ),
  undoPayment: (gameId: number, paymentId: number) =>
    call<{ debts: Debt[]; payments: Payment[] }>(
      `/games/${gameId}/payments/${paymentId}`,
      { method: 'DELETE' }
    ),
  bank: () => call<BankPanel>('/bank'),
  bankBanner: () => call<BankBanner>('/bank/banner'),
  bankSettings: (change: BankSettingsChange) =>
    call<BankPanel>('/bank/settings', { method: 'PUT', body: body(change) }),
  bankWords: (include: string[], exclude: string[]) =>
    call<BankPanel>('/bank/words', {
      method: 'PUT',
      body: body({ include, exclude }),
    }),
  /** Where the bank's own page is, to send the browser to. */
  connectBank: () => call<{ url: string }>('/bank/connect', { method: 'POST' }),
  disconnectBank: () => call<BankPanel>('/bank/disconnect', { method: 'POST' }),
  /** Reads the account now; a refusal and a failure are answers, not errors. */
  readBank: async (): Promise<ReadAnswer> => {
    try {
      const counts = await call<ReadCounts>('/bank/read', { method: 'POST' });
      return { kind: 'read', counts };
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      const { extra } = e;
      if (e.status === 409 && typeof extra.refusal === 'string') {
        return {
          kind: 'refused',
          code: extra.refusal as Extract<
            ReadAnswer,
            { kind: 'refused' }
          >['code'],
          until: typeof extra.until === 'string' ? extra.until : null,
        };
      }
      if (e.status === 502 && typeof extra.failure === 'string') {
        return {
          kind: 'failed',
          failure: extra.failure,
          code: String(extra.code ?? ''),
        };
      }
      throw e;
    }
  },
  pairings: () => call<Pairing[]>('/bizums/pairings'),
  setBizumName: (playerId: number, bizumName: string) =>
    call<Pairing[]>(`/bizums/pairings/${playerId}`, {
      method: 'PUT',
      body: body({ bizumName }),
    }),
  removeBizumName: (playerId: number, bizumName: string) =>
    call<Pairing[]>(
      `/bizums/pairings/${playerId}?name=${encodeURIComponent(bizumName)}`,
      { method: 'DELETE' }
    ),
  waitingBizums: () => call<WaitingBizum[]>('/bizums/waiting'),
  settledBizums: () => call<SettledBizum[]>('/bizums/settled'),
  /** `own`: only the player's own shares, the ones someone else may pay for them. */
  openShares: (bizumId: number, playerId: number, own = false) =>
    call<RulableShare[]>(
      `/bizums/${bizumId}/open-shares?playerId=${playerId}${own ? '&own=1' : ''}`
    ),
  pairBizum: (bizumId: number, playerId: number) =>
    call<PairResult>(`/bizums/${bizumId}/pair`, {
      method: 'POST',
      body: body({ playerId }),
    }),
  ruleBizum: (
    bizumId: number,
    playerId: number,
    shares: number,
    rest: RestOfBizum,
    others: SharesFor[] = []
  ) =>
    call<Ruling>(`/bizums/${bizumId}/rule`, {
      method: 'POST',
      body: body({ playerId, shares, rest, others }),
    }),
  dismissBizum: (bizumId: number) =>
    call<{ waiting: WaitingBizum[] }>(`/bizums/${bizumId}/dismiss`, {
      method: 'POST',
    }),
};
