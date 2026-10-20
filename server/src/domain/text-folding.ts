/** Compares texts the way a person would: case, accents and extra spaces do not matter. */
export class TextFolding {
  /** NFD, combining marks removed, lower case. */
  fold(text: string): string {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
  }

  /** Folded, with runs of spaces collapsed and the ends trimmed. */
  tidy(text: string): string {
    return this.fold(text).replace(/\s+/g, ' ').trim();
  }

  same(a: string, b: string): boolean {
    return this.tidy(a) === this.tidy(b);
  }
}
