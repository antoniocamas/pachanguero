import { Bizum, BizumKey, type BizumParty } from '../bizum/model.js';
import type {
  AccountChoice,
  AccountRef,
  BankRef,
  BizumDialect,
  RawAccount,
  RawEntry,
  Recognised,
} from '../bizum/ports.js';

/**
 * How Revolut shows a Bizum: a booked credit whose remittance is two texts, the message and
 * then `Bizum payment from: <sender>`, the sender being an abbreviated name or a phone number.
 * Outgoing Bizums are never recognised, because that format was never examined.
 */
export class RevolutDialect implements BizumDialect {
  private static readonly PREFIX = 'Bizum payment from: ';
  private static readonly AMOUNT = /^(\d+)(?:\.(\d{1,2}))?$/;
  private static readonly PHONE = /^\+[\d ]+$/;
  private static readonly PHONE_DIGITS = 9;

  readonly id = 'revolut';
  readonly displayName = 'Revolut';
  readonly bank: BankRef = { name: 'Revolut', country: 'ES' };

  recognise(raw: RawEntry, account: AccountRef): Recognised {
    if (raw.status !== 'BOOK') {
      return { kind: 'ignore', why: 'pending', key: null };
    }
    const reference = this.text(raw.entry_reference);
    const key =
      reference === null ? null : new BizumKey(account.stableId, reference);
    const message = this.remittance(raw.remittance_information);
    if (raw.credit_debit_indicator !== 'CRDT' || message === null) {
      return { kind: 'ignore', why: 'not_a_bizum', key };
    }
    const bizum = key === null ? null : this.build(raw, key, message);
    return bizum === null
      ? { kind: 'ignore', why: 'unidentified', key: null }
      : { kind: 'bizum', bizum };
  }

  /** The aggregator's account: its `uid`, its stable hash and the `details`, where the currency is. */
  describeAccount(raw: RawAccount): AccountChoice {
    const hash = this.text(raw.identification_hash);
    const uid = this.text(raw.uid);
    if (hash === null)
      throw new Error('the account has no identification_hash');
    if (uid === null) throw new Error('the account has no uid');
    const details = this.record(raw.details);
    const iban =
      this.text(this.record(raw.account_id).iban) ??
      this.text(this.record(details.account_id).iban);
    return {
      stableId: hash,
      sessionId: uid,
      currency: this.text(details.currency) ?? '',
      kind: this.text(details.cash_account_type) ?? '',
      last4: (iban ?? hash).slice(-4),
    };
  }

  /** The sender's message and the sender text, or null when the remittance is not a Bizum's. */
  private remittance(
    value: unknown
  ): { message: string; sender: string } | null {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [message, last] = value;
    if (typeof message !== 'string' || typeof last !== 'string') return null;
    if (!last.startsWith(RevolutDialect.PREFIX)) return null;
    return { message, sender: last.slice(RevolutDialect.PREFIX.length).trim() };
  }

  private build(
    raw: RawEntry,
    key: BizumKey,
    remittance: { message: string; sender: string }
  ): Bizum | null {
    const amount = this.record(raw.transaction_amount);
    const cents = this.cents(amount.amount);
    const bookedOn = this.text(raw.booking_date);
    const currency = this.text(amount.currency);
    if (cents === null || bookedOn === null || currency === null) return null;
    try {
      return new Bizum({
        key,
        direction: 'incoming',
        bookedOn,
        amountCents: cents,
        currency,
        sender: this.sender(remittance.sender),
        receiver: { name: null, phone: null },
        subject: remittance.message,
      });
    } catch {
      return null;
    }
  }

  /** Decimal text with at most two decimals, read digit by digit and never through a float. */
  private cents(value: unknown): number | null {
    if (typeof value !== 'string') return null;
    const match = RevolutDialect.AMOUNT.exec(value);
    if (match === null) return null;
    const cents =
      Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
    return Number.isSafeInteger(cents) ? cents : null;
  }

  private sender(text: string): BizumParty {
    const digits = text.replace(/\D/g, '');
    if (
      RevolutDialect.PHONE.test(text) &&
      digits.length >= RevolutDialect.PHONE_DIGITS
    ) {
      return { name: null, phone: `+${digits}` };
    }
    return { name: text === '' ? null : text, phone: null };
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }
}
