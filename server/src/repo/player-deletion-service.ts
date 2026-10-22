import type Database from 'better-sqlite3';
import type { PlayerRepository } from './player-repository.js';
import type { UserRepository } from './user-repository.js';

/** Every place a player leaves a trace of having taken part, and how the refusal names it. */
const TRACES: readonly [sql: string, what: string][] = [
  [
    'SELECT 1 FROM participations WHERE player_id = @id',
    'está apuntado o ha jugado algún partido',
  ],
  [
    `SELECT 1 FROM candidate_lines WHERE name_player_id = @id OR host_player_id = @id
     UNION SELECT 1 FROM guest_candidates WHERE player_id = @id OR host_player_id = @id`,
    'aparece en una lista de apuntados',
  ],
  [
    `SELECT 1 FROM convocatoria_entries WHERE player_id = @id OR guest_host_player_id = @id
     UNION SELECT 1 FROM exclusions WHERE player_id = @id`,
    'aparece en una convocatoria',
  ],
  [
    `SELECT 1 FROM share_debts WHERE holder_player_id = @id OR beneficiary_player_id = @id
     UNION SELECT 1 FROM payments
      WHERE holder_player_id = @id OR beneficiary_player_id = @id OR payer_player_id = @id`,
    'tiene deudas o pagos',
  ],
  [
    'SELECT 1 FROM players WHERE introduced_by = @id',
    'presentó a otro jugador',
  ],
  [
    'SELECT 1 FROM player_hosts WHERE host_player_id = @id',
    'es anfitrión habitual de otro jugador',
  ],
];

/**
 * Deletes a player created by mistake: only one who has never taken part in anything and has no
 * account. Anyone with a history is refused, naming why; the same person registered twice is
 * merged instead. What is the player's alone (aliases, Bizum names, contact data, seniority,
 * roles, usual hosts) goes with them.
 */
export class PlayerDeletionService {
  constructor(
    private readonly players: PlayerRepository,
    private readonly users: UserRepository,
    private readonly conn: Database.Database
  ) {}

  delete(playerId: number): void {
    const name = this.players.nameOf(playerId);
    if (!name) throw new Error(`Unknown player: ${playerId}`);
    this.conn.transaction(() => {
      if (this.users.byPlayer(playerId)) {
        throw new Error(`No se puede borrar a ${name}: tiene usuario`);
      }
      for (const [sql, what] of TRACES) {
        if (this.conn.prepare(sql).get({ id: playerId })) {
          throw new Error(
            `No se puede borrar a ${name}: ${what}. Si es la misma persona que otro jugador, fúndelos`
          );
        }
      }
      this.conn.prepare('DELETE FROM players WHERE id = ?').run(playerId);
    })();
  }
}
