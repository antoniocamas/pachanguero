/**
 * A phone number reduced to one form, so how it was typed does not matter: spaces, dots and
 * dashes removed, a leading `00` read as `+`, and nine digits with no prefix taken as Spanish.
 */
export class PhoneKey {
  private readonly key: string;

  constructor(typed: string) {
    const compact = typed.replace(/[\s.\-()]/g, '');
    const international = compact.startsWith('00')
      ? `+${compact.slice(2)}`
      : compact;
    this.key = /^\d{9}$/.test(international)
      ? `+34${international}`
      : international;
  }

  toString(): string {
    return this.key;
  }

  sameAs(other: PhoneKey): boolean {
    return this.key === other.key;
  }
}
