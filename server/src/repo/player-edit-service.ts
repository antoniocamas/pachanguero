import type Database from 'better-sqlite3';
import { NameMatcher } from '../domain/name-matcher.js';
import { NameStripper } from '../domain/name-stripper.js';
import type { AliasRepository } from './alias-repository.js';
import type { PlayerRepository } from './player-repository.js';

/** A player with everything the organiser can correct about them. */
export interface PlayerDetail {
  id: number;
  name: string;
  introducedBy: number | null;
  aliases: string[];
}

export interface PlayerPatch {
  name?: string;
  introducedBy?: number | null;
  /** On a rename: remember the old name as an alias so pasted lists keep matching. */
  keepOldAsAlias?: boolean;
}

/**
 * Corrects what is known about a player: the principal name, the aliases and
 * who introduced them. A principal name is never shared, though an alias may
 * be: pasted lines using it are then reported as ambiguous, not guessed.
 */
export class PlayerEditService {
  private readonly stripper = new NameStripper();

  constructor(
    private readonly players: PlayerRepository,
    private readonly aliases: AliasRepository,
    private readonly conn: Database.Database
  ) {}

  list(): PlayerDetail[] {
    const all = this.aliases.listAll();
    return this.players.listDetailed().map(p => ({
      ...p,
      aliases: all.filter(a => a.playerId === p.id).map(a => a.alias),
    }));
  }

  update(playerId: number, patch: PlayerPatch): PlayerDetail {
    this.require(playerId);
    this.conn.transaction(() => {
      if (patch.name !== undefined) this.rename(playerId, patch);
      if (patch.introducedBy !== undefined) this.introduce(playerId, patch);
    })();
    return this.list().find(p => p.id === playerId)!;
  }

  addAlias(playerId: number, alias: string): void {
    this.require(playerId);
    const clean = this.stripper.strip(alias);
    if (!clean) throw new Error('alias is required');
    this.aliases.add(playerId, clean);
  }

  removeAlias(playerId: number, alias: string): void {
    this.require(playerId);
    this.aliases.remove(playerId, alias);
  }

  private rename(playerId: number, patch: PlayerPatch): void {
    const name = this.stripper.strip(patch.name ?? '');
    if (!name) throw new Error('name is required');
    const old = this.players.nameOf(playerId)!;
    if (name === old) return;
    this.requireFree(name, playerId);
    // Promoting one of their own aliases: it stops being an alias.
    this.aliases.remove(playerId, name);
    this.players.rename(playerId, name);
    if (patch.keepOldAsAlias) this.aliases.add(playerId, old);
  }

  private introduce(playerId: number, patch: PlayerPatch): void {
    const by = patch.introducedBy ?? null;
    if (by === playerId)
      throw new Error('A player cannot introduce themselves');
    if (by !== null) this.require(by);
    this.players.setIntroducedBy(playerId, by);
  }

  /** The principal name must not already be somebody else's. */
  private requireFree(name: string, playerId: number): void {
    const found = new NameMatcher(
      this.players.listAll().filter(p => p.id !== playerId),
      []
    ).match(name);
    if (found.outcome !== 'unresolved') {
      throw new Error(`"${name}" ya es el nombre de otro jugador`);
    }
  }

  private require(playerId: number): void {
    if (!this.players.nameOf(playerId)) {
      throw new Error(`Unknown player: ${playerId}`);
    }
  }
}
