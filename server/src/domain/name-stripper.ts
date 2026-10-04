const LIST_MARKER = /^\s*(?:\d+[.)]?|[•\-*])\s*/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|️/gu;

/** Removes WhatsApp decoration from a pasted name: list marker, emoji, stray spaces. */
export class NameStripper {
  /** Drop the list marker, then emoji, then tidy whitespace — in that order. */
  strip(raw: string): string {
    return raw
      .replace(LIST_MARKER, '')
      .replace(EMOJI, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
