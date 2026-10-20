export type BizumDirection = 'incoming' | 'outgoing';

/** One side of a Bizum as the bank shows it; a bank fills what it has. */
export interface BizumParty {
  /** As displayed by the bank, possibly abbreviated ("Marta G.L."). */
  readonly name: string | null;
  /** As displayed by the bank ("+34600000000"). */
  readonly phone: string | null;
}

/** The bank's own identification of an entry, stable across sessions. */
export class BizumKey {
  readonly account: string;
  readonly reference: string;

  constructor(account: string, reference: string) {
    if (account.trim() === '') throw new Error('key.account is empty');
    if (reference.trim() === '') throw new Error('key.reference is empty');
    this.account = account;
    this.reference = reference;
  }

  sameAs(other: BizumKey): boolean {
    return this.account === other.account && this.reference === other.reference;
  }
}

export interface BizumFields {
  key: BizumKey;
  direction: BizumDirection;
  /** YYYY-MM-DD, a real calendar date. */
  bookedOn: string;
  /** A positive integer. */
  amountCents: number;
  /** Three upper-case letters. */
  currency: string;
  sender: BizumParty;
  receiver: BizumParty;
  /** Empty or blank text is stored as null. */
  subject: string | null;
}

/** A Bizum as any bank reports it; built only through its checks. */
export class Bizum {
  readonly key: BizumKey;
  readonly direction: BizumDirection;
  readonly bookedOn: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly sender: BizumParty;
  readonly receiver: BizumParty;
  readonly subject: string | null;

  constructor(fields: BizumFields) {
    if (fields.direction !== 'incoming' && fields.direction !== 'outgoing') {
      throw new Error('direction is neither incoming nor outgoing');
    }
    if (!this.isCalendarDate(fields.bookedOn)) {
      throw new Error(`bookedOn is not a calendar date: ${fields.bookedOn}`);
    }
    if (!Number.isInteger(fields.amountCents) || fields.amountCents <= 0) {
      throw new Error(
        `amountCents is not a positive integer: ${fields.amountCents}`
      );
    }
    if (!/^[A-Z]{3}$/.test(fields.currency)) {
      throw new Error(
        `currency is not three upper-case letters: ${fields.currency}`
      );
    }
    this.key = fields.key;
    this.direction = fields.direction;
    this.bookedOn = fields.bookedOn;
    this.amountCents = fields.amountCents;
    this.currency = fields.currency;
    this.sender = this.cleanParty(fields.sender);
    this.receiver = this.cleanParty(fields.receiver);
    this.subject = this.blankToNull(fields.subject);
  }

  /** The party who is not the account holder: the sender of an incoming Bizum, the receiver of an outgoing one. */
  counterparty(): BizumParty {
    return this.direction === 'incoming' ? this.sender : this.receiver;
  }

  private isCalendarDate(text: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return false;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  private cleanParty(party: BizumParty): BizumParty {
    return {
      name: this.blankToNull(party.name),
      phone: this.blankToNull(party.phone),
    };
  }

  private blankToNull(text: string | null): string | null {
    return text === null || text.trim() === '' ? null : text;
  }
}
