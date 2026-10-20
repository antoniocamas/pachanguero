import type { Bizum, BizumParty } from '../bizum/model.js';
import type {
  BizumFacts,
  OpenShare,
  RulableShare,
  SenderIdentity,
} from '../domain/bizum-rules.js';
import { KeywordList } from '../domain/keyword-list.js';
import { NearestDebtOrder } from '../domain/nearest-debt-order.js';
import { SenderIdentification } from '../domain/sender-identification.js';
import { SenderSuggestion } from '../domain/sender-suggestion.js';
import type { AliasRepository } from './alias-repository.js';
import type { ContactRepository } from './contact-repository.js';
import type { DebtRepository, OutstandingShare } from './debt-repository.js';
import type { PlayerRepository } from './player-repository.js';
import type { SeasonRepository } from './season-repository.js';
import { ShareRowMember } from './share-rows.js';

/** The two keyword lists the organiser keeps; implemented where they are stored. */
export interface KeywordSource {
  include(): string[];
  exclude(): string[];
}

/**
 * Gathers what the rules need to judge a Bizum: the season it falls in, who sent it, which
 * shares that player still owes in that season, and the keyword lists. Reads only; a share of
 * another season is never read.
 */
export class BizumFactsReader {
  private readonly members = new ShareRowMember();
  private readonly order = new NearestDebtOrder();

  constructor(
    private readonly seasons: SeasonRepository,
    private readonly players: PlayerRepository,
    private readonly aliases: AliasRepository,
    private readonly contacts: ContactRepository,
    private readonly debts: DebtRepository,
    private readonly keywords: KeywordSource
  ) {}

  read(bizum: Bizum): BizumFacts {
    const season = this.seasons.current(bizum.bookedOn);
    const shareCents = season ? this.seasons.shareCents(season.id) : null;
    const sender = this.identify(bizum.sender);
    return {
      amountCents: bizum.amountCents,
      subject: bizum.subject,
      shareCents,
      sender,
      openShares:
        sender.kind === 'player'
          ? this.openSharesOf(sender.playerId, bizum)
          : [],
      include: new KeywordList(this.keywords.include()),
      exclude: new KeywordList(this.keywords.exclude()),
    };
  }

  /** Who the sender is, from what the group has stored for its players. */
  identify(sender: BizumParty): SenderIdentity {
    return this.identification().identify(sender);
  }

  /**
   * The shares this player still owes in the Bizum's season, nearest first; none when no season
   * holds the booking date.
   */
  openSharesOf(playerId: number, bizum: Bizum): OpenShare[] {
    const season = this.seasons.current(bizum.bookedOn);
    if (!season) return [];
    return this.order.order(
      this.debts
        .openInSeason(playerId, season.id)
        .map(share => this.openShare(share)),
      playerId,
      bizum.bookedOn
    );
  }

  /**
   * What the organiser may pay with the Bizum: the shares the rules would use, then the shares of
   * games played after the booking date, earliest first, then those of earlier seasons, the
   * latest game first; each marked as such.
   */
  candidateSharesOf(playerId: number, bizum: Bizum): RulableShare[] {
    const mark = (
      shares: OpenShare[],
      afterBooking: boolean,
      previousSeason: boolean
    ): RulableShare[] =>
      shares.map(share => ({ ...share, afterBooking, previousSeason }));
    return [
      ...mark(this.openSharesOf(playerId, bizum), false, false),
      ...mark(this.laterSharesOf(playerId, bizum), true, false),
      ...mark(this.previousSeasonsSharesOf(playerId, bizum), false, true),
    ];
  }

  /** The shares of games played in seasons before the Bizum's, the latest game first. */
  previousSeasonsSharesOf(playerId: number, bizum: Bizum): OpenShare[] {
    const season = this.seasons.current(bizum.bookedOn);
    if (!season) return [];
    return this.order.latestFirst(
      this.debts
        .openBefore(playerId, season.starts_on)
        .map(share => this.openShare(share)),
      playerId
    );
  }

  /** The shares of games played after the booking date, in the Bizum's season, earliest first. */
  laterSharesOf(playerId: number, bizum: Bizum): OpenShare[] {
    const season = this.seasons.current(bizum.bookedOn);
    if (!season) return [];
    return this.order.later(
      this.debts
        .openInSeason(playerId, season.id)
        .map(share => this.openShare(share)),
      playerId,
      bizum.bookedOn
    );
  }

  private identification(): SenderIdentification {
    return new SenderIdentification(
      this.players.listBizumNames(),
      this.contacts.listPhones(),
      new SenderSuggestion(this.players.listAll(), this.aliases.listAll())
    );
  }

  private openShare(share: OutstandingShare): OpenShare {
    return {
      debtId: share.id,
      gameId: share.gameId,
      playedOn: share.playedOn,
      member: this.members.keyOf({
        game_id: share.gameId,
        holder_player_id: share.holderId,
        beneficiary_player_id: share.beneficiaryId,
        guest_ordinal: share.guestOrdinal,
        amount_cents: share.amountCents,
      }),
      holderId: share.holderId,
      amountCents: share.amountCents,
    };
  }
}
