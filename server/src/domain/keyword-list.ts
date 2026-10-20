import { TextFolding } from './text-folding.js';

/**
 * A list of words a subject may contain. A word matches only as a whole word, bounded by the
 * ends of the subject or by anything that is not a letter or a digit; a word of several words
 * matches as a phrase. Case and accents are ignored.
 */
export class KeywordList {
  private readonly folding = new TextFolding();
  private readonly entries: readonly { word: string; pattern: RegExp }[];

  constructor(words: readonly string[]) {
    this.entries = words
      .map(word => ({ word: word.trim(), folded: this.folding.tidy(word) }))
      .filter(entry => entry.folded !== '')
      .map(entry => ({
        word: entry.word,
        pattern: this.patternFor(entry.folded),
      }));
  }

  /** The first listed word found in the subject, as it is listed, or null. */
  find(subject: string | null): string | null {
    if (subject === null) return null;
    const folded = this.folding.tidy(subject);
    return this.entries.find(entry => entry.pattern.test(folded))?.word ?? null;
  }

  private patternFor(folded: string): RegExp {
    const escaped = folded
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/ /g, '\\s+');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u');
  }
}
