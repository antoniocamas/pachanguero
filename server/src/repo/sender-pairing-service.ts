import type Database from 'better-sqlite3';
import type { BizumStore } from '../bizum/ports.js';
import { SenderMatch } from '../domain/sender-match.js';
import { TextFolding } from '../domain/text-folding.js';
import type { BizumFactsReader } from './bizum-facts-reader.js';
import type { BizumHandlingRepository } from './bizum-handling-repository.js';
import {
  BizumRefusal,
  type BizumResolutionService,
  type Reevaluated,
} from './bizum-resolution-service.js';
import type { ContactRepository } from './contact-repository.js';
import type { PlayerRepository } from './player-repository.js';

export interface Pairing {
  playerId: number;
  playerName: string;
  bizumName: string;
}

export interface PairResult {
  /** The phone the player had before, when a phone was paired and it was another one. */
  replaced: string | null;
  /** The other players who now hold the same Bizum name or phone. */
  sharedWith: { playerId: number; name: string }[];
  results: Reevaluated[];
}

/**
 * Teaches the system who a sender is: a name sender becomes one more of the player's Bizum names
 * (the bank may show a player under several), a phone sender becomes the player's phone. A sender
 * is known only by what is stored here, so this is the only way a Bizum gets a payer it was not
 * already matched to.
 */
export class SenderPairingService {
  static readonly NAME_MAX = 80;

  private readonly senders = new SenderMatch();
  private readonly folding = new TextFolding();

  constructor(
    private readonly store: BizumStore,
    private readonly handling: BizumHandlingRepository,
    private readonly resolution: BizumResolutionService,
    private readonly facts: BizumFactsReader,
    private readonly players: PlayerRepository,
    private readonly contacts: ContactRepository,
    private readonly conn: Database.Database
  ) {}

  /** Pairs the Bizum's sender with the player and judges that sender's waiting Bizums again. */
  pair(bizumId: number, playerId: number): PairResult {
    return this.conn.transaction(() => {
      const stored = this.store.find(bizumId);
      if (stored === null) throw new BizumRefusal('No existe ese Bizum');
      if (this.handling.get(bizumId)?.status !== 'waiting') {
        throw new BizumRefusal('Ese Bizum ya no está en espera');
      }
      this.requirePlayer(playerId);
      const sender = stored.bizum.sender;
      const replaced = this.write(playerId, sender);
      const results = this.resolution.reevaluate(
        this.handling
          .waitingByBooking()
          .map(handling => handling.bizumId)
          .filter(id => {
            const other = this.store.find(id);
            return (
              other !== null && this.senders.same(sender, other.bizum.sender)
            );
          })
      );
      return {
        replaced,
        sharedWith: this.sharedWith(sender, playerId),
        results,
      };
    })();
  }

  /** The players who have a Bizum name. */
  pairings(): Pairing[] {
    const names = new Map(this.players.listAll().map(p => [p.id, p.name]));
    return this.players
      .listBizumNames()
      .map(entry => ({
        playerId: entry.playerId,
        playerName: names.get(entry.playerId) ?? '',
        bizumName: entry.bizumName,
      }))
      .sort((a, b) => a.playerName.localeCompare(b.playerName, 'es'));
  }

  /** Gives the player one more name the organiser typed, next to the ones they have. Judges nothing. */
  addBizumName(playerId: number, bizumName: string): void {
    this.requirePlayer(playerId);
    const name = bizumName.trim();
    if (name === '') throw new BizumRefusal('Indica el nombre de Bizum');
    this.requireFits(name);
    this.addName(playerId, name);
  }

  /** Removes one of the player's Bizum names; their other names and the payments already made stay. */
  removeBizumName(playerId: number, bizumName: string): void {
    this.requirePlayer(playerId);
    this.players.removeBizumName(playerId, bizumName);
  }

  /** Writes the phone or the name the sender showed; returns the phone it replaced. */
  private write(
    playerId: number,
    sender: { name: string | null; phone: string | null }
  ): string | null {
    if (sender.phone !== null) {
      const before = this.contacts.get(playerId).phone;
      this.contacts.save(playerId, { phone: sender.phone });
      return before !== null && before !== sender.phone ? before : null;
    }
    if (sender.name === null) {
      throw new BizumRefusal('Ese Bizum no dice quién lo envía');
    }
    this.requireFits(sender.name);
    this.addName(playerId, sender.name);
    return null;
  }

  /** A name the player already has, in other capitals or accents, is not added again. */
  private addName(playerId: number, name: string): void {
    const known = this.players
      .bizumNamesOf(playerId)
      .some(held => this.folding.same(held, name));
    if (!known) this.players.addBizumName(playerId, name);
  }

  private sharedWith(
    sender: { name: string | null; phone: string | null },
    playerId: number
  ): { playerId: number; name: string }[] {
    const identity = this.facts.identify(sender);
    if (identity.kind !== 'ambiguous') return [];
    return identity.playerIds
      .filter(id => id !== playerId)
      .map(id => ({ playerId: id, name: this.players.nameOf(id) ?? '' }));
  }

  private requireFits(name: string): void {
    if (name.length > SenderPairingService.NAME_MAX) {
      throw new BizumRefusal(
        `El nombre de Bizum no puede pasar de ${SenderPairingService.NAME_MAX} caracteres`
      );
    }
  }

  private requirePlayer(playerId: number): void {
    if (this.players.nameOf(playerId) === undefined) {
      throw new BizumRefusal('No existe ese jugador');
    }
  }
}
