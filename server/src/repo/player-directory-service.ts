import type Database from 'better-sqlite3';
import {
  SeasonRoleError,
  SeasonRolePolicy,
  type SeasonRole,
} from '../domain/season-role.js';
import type { AliasRepository } from './alias-repository.js';
import type { CandidateResolutionService } from './candidate-resolution-service.js';
import type { Contact, ContactRepository } from './contact-repository.js';
import type { ContactService } from './contact-service.js';
import type { DebtRepository } from './debt-repository.js';
import type { GuestRoleService } from './guest-role-service.js';
import type { PlayerActivityRepository } from './player-activity-repository.js';
import type { PlayerHostRepository } from './player-host-repository.js';
import type { PlayerRepository } from './player-repository.js';
import type { SeasonRoleRepository } from './season-role-repository.js';
import type { UserRepository } from './user-repository.js';

/** One player as the organiser's players table shows them, for one season. */
export interface DirectoryRow {
  id: number;
  name: string;
  aliases: string[];
  introducedBy: number | null;
  role: SeasonRole;
  /** The season has the role written, rather than carried over from before. */
  roleWritten: boolean;
  /** The usual one first. */
  usualHosts: number[];
  emails: string[];
  phone: string | null;
  bizumNames: string[];
  /** Seasons of seniority in this season; null when they have not appeared in it. */
  seasons: number | null;
  username: string | null;
  played: number;
  asGuest: number;
  lastPlayedOn: string | null;
  /** What they answer for in the season's played games. */
  owedCents: number;
  createdOn: string;
}

/**
 * Everything the organiser knows and corrects about the players beyond names and aliases: their
 * role in a season, who usually brings them and their contact data (the names
 * the bank shows them under are paired through the Bizum pairings). A change that decides who is a guest reaches the games not played
 * yet, in the same transaction.
 */
export class PlayerDirectoryService {
  private readonly policy = new SeasonRolePolicy();

  constructor(
    private readonly players: PlayerRepository,
    private readonly aliases: AliasRepository,
    private readonly roles: SeasonRoleRepository,
    private readonly guestRoles: GuestRoleService,
    private readonly hosts: PlayerHostRepository,
    private readonly contactRepository: ContactRepository,
    private readonly contacts: ContactService,
    private readonly users: UserRepository,
    private readonly debts: DebtRepository,
    private readonly activity: PlayerActivityRepository,
    private readonly candidates: CandidateResolutionService,
    private readonly conn: Database.Database
  ) {}

  table(seasonId: number): DirectoryRow[] {
    const context = this.guestRoles.forSeason(seasonId);
    const written = this.roles.listForSeason(seasonId);
    const aliases = this.aliases.listAll();
    const bizumNames = this.players.listBizumNames();
    const contacts = this.contactRepository.listAll();
    const seniority = new Map(
      this.players.list(seasonId).map(p => [p.id, p.seasons])
    );
    const accounts = new Map(
      this.users
        .list()
        .flatMap(u => (u.playerId === null ? [] : [[u.playerId, u.username]]))
    );
    const owed = this.debts.totalsByHolder(seasonId);
    const activity = this.activity.bySeason(seasonId);
    const created = this.activity.createdOn();
    return this.players.listDetailed().map(p => {
      const contact: Contact = contacts.get(p.id) ?? {
        emails: [],
        phone: null,
      };
      const did = activity.get(p.id);
      return {
        id: p.id,
        name: p.name,
        aliases: aliases.filter(a => a.playerId === p.id).map(a => a.alias),
        introducedBy: p.introducedBy,
        role: context.roleOf(p.id),
        roleWritten: written.has(p.id),
        usualHosts: [...context.usualHosts(p.id)],
        emails: contact.emails,
        phone: contact.phone,
        bizumNames: bizumNames
          .filter(b => b.playerId === p.id)
          .map(b => b.bizumName),
        seasons: seniority.get(p.id) ?? null,
        username: accounts.get(p.id) ?? null,
        played: did?.played ?? 0,
        asGuest: did?.asGuest ?? 0,
        lastPlayedOn: did?.lastPlayedOn ?? null,
        owedCents: owed.get(p.id) ?? 0,
        createdOn: created.get(p.id) ?? '',
      };
    });
  }

  /** A fijo who has played as one this season cannot become an invitado in it. */
  setRole(seasonId: number, playerId: number, role: SeasonRole): void {
    const name = this.require(playerId);
    if (role !== 'fijo' && role !== 'invitado') {
      throw new SeasonRoleError('El papel es fijo o invitado');
    }
    this.conn.transaction(() => {
      const from = this.guestRoles.forSeason(seasonId).roleOf(playerId);
      this.policy.checkChange(
        from,
        role,
        this.roles.playedAsFijo(seasonId, playerId),
        name
      );
      this.roles.set(seasonId, playerId, role);
      this.candidates.refreshUnplayed();
    })();
  }

  /** The usual hosts, the usual one first; a player never hosts themselves. */
  setHosts(playerId: number, hostIds: readonly number[]): void {
    this.require(playerId);
    const unique = [...new Set(hostIds)];
    for (const hostId of unique) {
      if (hostId === playerId)
        throw new Error('Un jugador no puede traerse a sí mismo');
      this.require(hostId);
    }
    this.conn.transaction(() => {
      this.hosts.replace(playerId, unique);
      this.candidates.refreshUnplayed();
    })();
  }

  /** The organiser keeps a player's contact data as the player would, by the same rules. */
  saveContact(playerId: number, input: unknown): Contact {
    this.require(playerId);
    return this.contacts.save(playerId, input);
  }

  private require(playerId: number): string {
    const name = this.players.nameOf(playerId);
    if (!name) throw new Error(`Unknown player: ${playerId}`);
    return name;
  }
}
