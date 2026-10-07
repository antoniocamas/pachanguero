import type {
  Arrival,
  ConvocatoriaEntry,
  GameDetail,
  GameState,
  MemberKey,
  Participation,
  Team,
} from '../api';
import { holdsCents } from './holdings';
import { keyOf, memberOf } from './shares';

/** Spanish names of the special entries a row can carry. */
export type RowLabel = 'plaza de gracia' | 'degradado' | 'cambiado a mano';

export interface GameRow {
  key: MemberKey;
  /** Stable across reloads: the member's share key. */
  id: string;
  name: string;
  /** null for an anonymous plus-one. */
  playerId: number | null;
  /** Who brought an anonymous plus-one. */
  hostPlayerId: number | null;
  /** Place in the convocatoria; null before it exists. */
  position: number | null;
  /** Place in the candidate list. */
  arrival: number | null;
  points: number | null;
  /** Inside the line: playing. */
  inLine: boolean;
  labels: RowLabel[];
  /** null where it is not known (a plus-one has no row of their own). */
  played: boolean | null;
  team: Team | null;
  /** What the row's player still answers for. */
  owedCents: number;
  /** A plus-one drawn under its host, once the game is played. */
  sub: boolean;
}

/** The states a table is laid out for; a cancelled game shows the one it left. */
export type TableState = Exclude<GameState, 'cancelled'>;

export interface GameTable {
  state: TableState;
  /** A cancelled game's table cannot be acted on. */
  readOnly: boolean;
  rows: GameRow[];
  /** Rows above the line, when the state draws one; null otherwise. */
  lineAfter: number | null;
}

const byName = (a: GameRow, b: GameRow) => a.name.localeCompare(b.name, 'es');

/** Builds the table the game screen shows for the game's state. */
export const buildRows = (detail: GameDetail): GameTable => {
  const readOnly = detail.state === 'cancelled';
  const state: TableState =
    detail.state === 'cancelled'
      ? (detail.game.cancelled_from ?? 'open')
      : detail.state;
  const rows = new RowBuilder(detail);

  switch (state) {
    case 'open':
      return { state, readOnly, rows: rows.arrivalRows(), lineAfter: null };
    case 'convocatoria_created':
    case 'convocatoria_confirmed': {
      const entries = rows.entryRows();
      const members = entries.filter(r => r.inLine);
      return {
        state,
        readOnly,
        rows: [...members, ...entries.filter(r => !r.inLine)],
        lineAfter: members.length,
      };
    }
    case 'played':
      return {
        state,
        readOnly,
        rows: rows.playedRows(),
        lineAfter: null,
      };
  }
};

class RowBuilder {
  private readonly names: Map<number, string>;
  private readonly participations: Map<number, Participation>;

  constructor(private readonly detail: GameDetail) {
    this.names = new Map(detail.participations.map(p => [p.player_id, p.name]));
    this.participations = new Map(
      detail.participations.map(p => [p.player_id, p])
    );
    for (const e of detail.convocatoria?.entries ?? [])
      if (e.player_id !== null) this.names.set(e.player_id, e.name);
  }

  /** The matched lines of the candidate list, in arrival order. */
  arrivalRows(): GameRow[] {
    return this.detail.arrivals.map(a => {
      const key = this.arrivalKey(a);
      const playerId = a.playerId;
      return this.row(key, {
        name: this.arrivalName(a),
        playerId,
        hostPlayerId: playerId === null ? a.hostPlayerId : null,
        arrival: a.position,
        points:
          playerId === null ? null : (this.detail.points[playerId] ?? null),
      });
    });
  }

  /** Every entry of the stored convocatoria, by position. */
  entryRows(): GameRow[] {
    return [...(this.detail.convocatoria?.entries ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(e => this.entryRow(e));
  }

  /** Those who owe first, then alphabetical; a plus-one right under its host. */
  playedRows(): GameRow[] {
    const all = this.entryRows().map(r => this.withDebt(r));
    const hosts = all.filter(r => r.playerId !== null);
    const guests = all.filter(r => r.playerId === null);
    const subsOf = (host: GameRow) =>
      guests
        .filter(g => g.hostPlayerId === host.playerId)
        .map(g => ({ ...g, sub: true }));
    const placed = new Set(hosts.flatMap(h => subsOf(h).map(g => g.id)));
    const orphans = guests.filter(g => !placed.has(g.id));
    return [...hosts.sort((a, b) => this.owingFirst(a, b)), ...orphans].flatMap(
      r => (r.playerId === null ? [r] : [r, ...subsOf(r)])
    );
  }

  private owingFirst(a: GameRow, b: GameRow): number {
    return Number(b.owedCents > 0) - Number(a.owedCents > 0) || byName(a, b);
  }

  private withDebt(row: GameRow): GameRow {
    const { debts } = this.detail;
    const own = debts.find(d => keyOf(memberOf(d)) === row.id);
    const owed =
      row.playerId === null
        ? (own?.amount_cents ?? 0)
        : holdsCents(debts, row.playerId) +
          (own && own.holder_player_id !== row.playerId ? own.amount_cents : 0);
    return { ...row, owedCents: owed };
  }

  private entryRow(e: ConvocatoriaEntry): GameRow {
    const key: MemberKey =
      e.player_id !== null
        ? { playerId: e.player_id }
        : { hostPlayerId: e.guest_host_player_id!, ordinal: e.guest_ordinal! };
    const labels: RowLabel[] = [];
    if (e.outcome === 'mercy' && e.playing) labels.push('plaza de gracia');
    if (e.outcome === 'demoted') labels.push('degradado');
    if (e.changed_by_hand) labels.push('cambiado a mano');
    return this.row(key, {
      name: e.name,
      playerId: e.player_id,
      hostPlayerId: e.player_id === null ? e.guest_host_player_id : null,
      position: e.position,
      arrival: this.arrivalOf(key),
      points: e.points,
      inLine: e.playing === 1,
      labels,
    });
  }

  private row(key: MemberKey, fields: Partial<GameRow>): GameRow {
    const playerId = 'playerId' in key ? key.playerId : null;
    const participation =
      playerId === null ? undefined : this.participations.get(playerId);
    return {
      key,
      id: keyOf(key),
      name: '',
      playerId,
      hostPlayerId: null,
      position: null,
      arrival: null,
      points: null,
      inLine: true,
      labels: [],
      played: participation ? participation.played === 1 : null,
      team: participation?.team ?? null,
      owedCents: 0,
      sub: false,
      ...fields,
    };
  }

  private arrivalKey(a: Arrival): MemberKey {
    if (a.playerId !== null) return { playerId: a.playerId };
    const earlier = this.detail.arrivals.filter(
      x =>
        x.playerId === null &&
        x.hostPlayerId === a.hostPlayerId &&
        x.position <= a.position
    );
    return { hostPlayerId: a.hostPlayerId!, ordinal: earlier.length };
  }

  private arrivalOf(key: MemberKey): number | null {
    return (
      this.detail.arrivals.find(a => keyOf(this.arrivalKey(a)) === keyOf(key))
        ?.position ?? null
    );
  }

  private arrivalName(a: Arrival): string {
    if (a.playerId !== null) return this.names.get(a.playerId) ?? a.text;
    return `Invitado de ${this.names.get(a.hostPlayerId!) ?? a.text}`;
  }
}
