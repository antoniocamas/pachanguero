import type { DebtRepository } from '../repo/debt-repository.js';
import type { PlayerRepository } from '../repo/player-repository.js';
import {
  UserAdminError,
  type CreatedAccount,
  type UserAdminService,
} from '../repo/user-admin-service.js';

/** Accounts for trying the app by hand on a throwaway database. */
export class DevAccountSeeder {
  /** The same made-up password for every account: these are never real ones. */
  static readonly PASSWORD = 'Pachanguero-dev-1';

  constructor(
    private readonly accounts: UserAdminService,
    private readonly debts: DebtRepository,
    private readonly players: PlayerRepository
  ) {}

  /**
   * An admin with no player, an admin who is a player, and a regular user: the players are
   * the two who owe the most, so the screens have something to show. Accounts that already
   * exist are left alone, so running it twice is harmless.
   */
  async seed(): Promise<CreatedAccount[]> {
    const [debtor, other] = this.byDebt();
    const wanted = [
      { username: 'admin', role: 'admin' as const },
      { username: 'jefe', role: 'admin' as const, player: other },
      { username: 'jugador', role: 'regular' as const, player: debtor },
    ];
    const created: CreatedAccount[] = [];
    for (const { username, role, player } of wanted) {
      if (role === 'regular' && player === undefined) continue;
      try {
        created.push(
          await this.accounts.create({
            username,
            role,
            password: DevAccountSeeder.PASSWORD,
            player: player === undefined ? undefined : String(player),
          })
        );
      } catch (error) {
        if (!(error instanceof UserAdminError)) throw error;
      }
    }
    return created;
  }

  /** Player ids, those owing most first, then the rest by name. */
  private byDebt(): number[] {
    const owed = new Map<number, number>();
    for (const share of this.debts.outstanding()) {
      owed.set(
        share.holderId,
        (owed.get(share.holderId) ?? 0) + share.amountCents
      );
    }
    return this.players
      .listAll()
      .sort(
        (a, b) =>
          (owed.get(b.id) ?? 0) - (owed.get(a.id) ?? 0) ||
          a.name.localeCompare(b.name, 'es')
      )
      .map(p => p.id);
  }
}
