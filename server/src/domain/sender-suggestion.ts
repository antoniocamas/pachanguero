import type { NamedPlayer, PlayerAlias } from './name-matcher.js';
import { TextFolding } from './text-folding.js';

/**
 * Players a Bizum sender might be, to offer the organiser; never acted on. A name `w0 w1 … wk`
 * fits a sender `s0 i1…im` when `w0` is `s0` and the first letters of `w1 … wk`, in order, are a
 * prefix of the sender's initials. A one-word name fits on its first word alone.
 */
export class SenderSuggestion {
  private readonly folding = new TextFolding();

  constructor(
    private readonly players: readonly NamedPlayer[],
    private readonly aliases: readonly PlayerAlias[]
  ) {}

  /** Distinct player ids, ordered by name. */
  suggest(senderName: string | null): number[] {
    if (senderName === null) return [];
    const [first, ...rest] = this.words(senderName);
    if (first === undefined) return [];
    const initials = rest.join('').replace(/[^\p{L}]/gu, '');
    return this.players
      .filter(player =>
        this.namesOf(player).some(name => this.fits(name, first, initials))
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map(player => player.id);
  }

  private namesOf(player: NamedPlayer): string[] {
    return [
      player.name,
      ...this.aliases.filter(a => a.playerId === player.id).map(a => a.alias),
    ];
  }

  private fits(
    name: string,
    senderFirst: string,
    senderInitials: string
  ): boolean {
    const [first, ...rest] = this.words(name);
    if (first !== senderFirst) return false;
    const letters = rest.map(word => word.match(/\p{L}/u)?.[0] ?? '').join('');
    return senderInitials.startsWith(letters);
  }

  private words(name: string): string[] {
    return this.folding
      .tidy(name)
      .split(' ')
      .filter(word => word !== '');
  }
}
