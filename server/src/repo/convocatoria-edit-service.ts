import type Database from 'better-sqlite3';
import type { MemberKey } from '../domain/types.js';
import type { ConvocatoriaRepository } from './convocatoria-repository.js';
import type { GameLifecycleService } from './game-lifecycle-service.js';
import type { GameRepository } from './game-repository.js';
import type { PlayerRepository } from './player-repository.js';
import type { StandingsService } from './standings-service.js';

/**
 * Hand corrections to a stored convocatoria: members move in and out of the
 * playing line, never past the cap, and the entries follow who is signed up.
 * Only `playing` is ever edited, so what the selection chose stays auditable.
 */
export class ConvocatoriaEditService {
  constructor(
    private readonly games: GameRepository,
    private readonly convocatorias: ConvocatoriaRepository,
    private readonly lifecycle: GameLifecycleService,
    private readonly standings: StandingsService,
    private readonly players: PlayerRepository,
    private readonly conn: Database.Database
  ) {}

  /** Put a member in or out of the playing line. */
  move(gameId: number, member: MemberKey, playing: boolean): void {
    this.lifecycle.require(gameId, 'edit_convocatoria');
    const stored = this.convocatorias.find(gameId)!;
    const entry = this.convocatorias.entryOf(gameId, member);
    if (!entry) throw new Error(`${this.describe(member)} no está apuntado`);
    if (playing && entry.playing !== 1) {
      const { slots } = JSON.parse(stored.rules_json) as { slots: number };
      if (this.convocatorias.playingCount(gameId) >= slots)
        throw new Error('No quedan plazas');
    }
    this.convocatorias.setPlaying(entry.id, playing);
  }

  /**
   * Throws if the people about to be signed out of the game include someone
   * still in the playing line. Call before anything is written.
   */
  checkUnsign(gameId: number, signedUp: readonly MemberKey[]): void {
    const stored = this.convocatorias.find(gameId);
    if (!stored) return;
    const keep = new Set(signedUp.map(k => this.keyString(k)));
    for (const e of stored.entries) {
      if (e.playing === 1 && !keep.has(this.entryKey(e)))
        throw new Error('Quítalo primero de la convocatoria');
    }
  }

  /**
   * Make the entries follow the sign-ups: a new person gets an entry below the
   * line, and an entry for someone no longer signed up (and not playing) goes.
   */
  align(gameId: number, signedUp: readonly MemberKey[]): void {
    const stored = this.convocatorias.find(gameId);
    if (!stored) return;
    const game = this.games.get(gameId)!;
    const keep = new Set(signedUp.map(k => this.keyString(k)));
    const have = new Set(stored.entries.map(e => this.entryKey(e)));
    this.conn.transaction(() => {
      for (const e of stored.entries) {
        if (!keep.has(this.entryKey(e))) this.convocatorias.removeEntry(e.id);
      }
      const points = new Map(
        this.standings
          .standings(game.season_id, game.id)
          .map(s => [s.playerId, s.points])
      );
      let position = stored.entries.reduce(
        (m, e) => Math.max(m, e.position),
        0
      );
      for (const key of signedUp) {
        if (have.has(this.keyString(key))) continue;
        this.convocatorias.addEntry(gameId, {
          key,
          position: ++position,
          points: 'playerId' in key ? (points.get(key.playerId) ?? 0) : 0,
          waitCounter: 0,
          outcome: 'excluded',
          playing: false,
        });
      }
    })();
  }

  /** Throws if the player is in the playing line, so they cannot be signed out. */
  requireNotMember(gameId: number, playerId: number): void {
    const entry = this.convocatorias.entryOf(gameId, { playerId });
    if (entry?.playing === 1)
      throw new Error('Quítalo primero de la convocatoria');
  }

  private describe(member: MemberKey): string {
    if ('playerId' in member)
      return (
        this.players.nameOf(member.playerId) ?? `El jugador ${member.playerId}`
      );
    const host =
      this.players.nameOf(member.hostPlayerId) ?? member.hostPlayerId;
    return `Invitado de ${host}`;
  }

  private keyString(key: MemberKey): string {
    return 'playerId' in key
      ? `p${key.playerId}`
      : `g${key.hostPlayerId}:${key.ordinal}`;
  }

  private entryKey(e: {
    player_id: number | null;
    guest_host_player_id: number | null;
    guest_ordinal: number | null;
  }): string {
    return e.player_id !== null
      ? `p${e.player_id}`
      : `g${e.guest_host_player_id}:${e.guest_ordinal}`;
  }
}
