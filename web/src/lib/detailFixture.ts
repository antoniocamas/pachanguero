import type {
  Arrival,
  ConvocatoriaEntry,
  Debt,
  GameDetail,
  GameState,
  Outcome,
  Participation,
  Payment,
  Team,
} from '../api';

/** A game detail for the lib tests, built one piece at a time. */
export class DetailFixture {
  private nextId = 1;
  private readonly detail: GameDetail = {
    game: {
      id: 1,
      season_id: 1,
      played_on: '2026-10-07',
      label: null,
      status: 'open',
      cancelled_from: null,
      notes: null,
    },
    state: 'open',
    nextAction: null,
    participations: [],
    convocatoria: null,
    debts: [],
    payments: [],
    arrivals: [],
    points: {},
  };

  state(state: GameState, cancelledFrom: GameState | null = null): this {
    this.detail.state = state;
    this.detail.game = {
      ...this.detail.game,
      status: state,
      cancelled_from: cancelledFrom as GameDetail['game']['cancelled_from'],
    };
    return this;
  }

  /** A signed-up player who arrived at `position`. */
  player(
    id: number,
    name: string,
    position: number,
    extra: Partial<Participation> = {}
  ): this {
    this.detail.participations.push({
      game_id: 1,
      player_id: id,
      name,
      signed_up: 1,
      played: 0,
      paid_cents: 0,
      paid_on: null,
      team: null,
      note: null,
      ...extra,
    });
    this.detail.arrivals.push({
      position,
      playerId: id,
      hostPlayerId: null,
      guest: null,
      text: name,
    });
    this.detail.points[id] = 5 - id / 10;
    return this;
  }

  /** An anonymous `+1` of `host` that arrived at `position`. */
  plusOne(host: number, position: number): this {
    const arrival: Arrival = {
      position,
      playerId: null,
      hostPlayerId: host,
      guest: 'anonymous',
      text: 'plus one',
    };
    this.detail.arrivals.push(arrival);
    return this;
  }

  /** The convocatoria entry of a player or of a host's nth plus-one. */
  entry(
    who: number | { host: number; ordinal: number },
    position: number,
    options: {
      outcome?: Outcome;
      playing?: boolean;
      byHand?: boolean;
      points?: number;
      name?: string;
    } = {}
  ): this {
    const player = typeof who === 'number' ? who : null;
    const entry: ConvocatoriaEntry = {
      id: this.nextId++,
      player_id: player,
      guest_host_player_id: typeof who === 'number' ? null : who.host,
      guest_ordinal: typeof who === 'number' ? null : who.ordinal,
      name:
        options.name ??
        (player === null
          ? 'Invitado'
          : (this.detail.participations.find(p => p.player_id === player)
              ?.name ?? `P${player}`)),
      changed_by_hand: options.byHand ?? false,
      position,
      points: options.points ?? 5,
      wait_counter: 0,
      outcome: options.outcome ?? 'called_up',
      playing: (options.playing ?? true) ? 1 : 0,
    };
    this.detail.convocatoria ??= {
      id: 1,
      rules: {},
      created_at: '2026-10-01',
      confirmed_at: null,
      source: 'generated',
      entries: [],
    };
    this.detail.convocatoria.entries.push(entry);
    return this;
  }

  team(playerId: number, team: Team, played = true): this {
    const p = this.detail.participations.find(x => x.player_id === playerId)!;
    p.team = team;
    p.played = played ? 1 : 0;
    return this;
  }

  /** A share still owed; `beneficiary` null names a host's plus-one. */
  debt(holder: number, beneficiary: number | null, cents = 400, ordinal = 1) {
    const debt: Debt = {
      id: this.nextId++,
      game_id: 1,
      holder_player_id: holder,
      beneficiary_player_id: beneficiary,
      guest_ordinal: beneficiary === null ? ordinal : null,
      amount_cents: cents,
    };
    this.detail.debts.push(debt);
    return this;
  }

  /** A settled share. */
  payment(
    holder: number,
    beneficiary: number | null,
    payer: number,
    cents = 400,
    ordinal = 1
  ): this {
    const payment: Payment = {
      id: this.nextId++,
      game_id: 1,
      holder_player_id: holder,
      beneficiary_player_id: beneficiary,
      guest_ordinal: beneficiary === null ? ordinal : null,
      amount_cents: cents,
      payer_player_id: payer,
      paid_on: '2026-10-07',
    };
    this.detail.payments.push(payment);
    return this;
  }

  build(): GameDetail {
    return structuredClone(this.detail);
  }
}
