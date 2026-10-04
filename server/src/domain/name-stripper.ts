const LIST_MARKER = /^\s*(?:\d+[.)]?|[•\-*])\s*/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|️/gu;

/** Invisible format characters (word joiner, zero-width space, direction marks, BOM). */
const INVISIBLE = /\p{Cf}/gu;

/** Removes WhatsApp decoration from a pasted name: invisible characters, list marker, emoji, stray spaces. */
export class NameStripper {
  /** Drop invisible characters, then the list marker, then emoji, then tidy whitespace — in that order. */
  strip(raw: string): string {
    return raw
      .replace(INVISIBLE, '')
      .replace(LIST_MARKER, '')
      .replace(EMOJI, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
