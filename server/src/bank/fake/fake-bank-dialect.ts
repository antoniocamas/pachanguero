import { Bizum, BizumKey, type BizumParty } from '../../bizum/model.js';
import type {
  AccountChoice,
  AccountRef,
  BankRef,
  BizumDialect,
  RawAccount,
  RawEntry,
  Recognised,
} from '../../bizum/ports.js';

/**
 * A second bank, shaped unlike Revolut: its entries carry both a name and a phone for each
 * party and an integer amount, so the rules are proved against two shapes. Its raw entry is
 * `{id, kind: 'BIZUM_IN' | 'BIZUM_OUT' | 'CARD', state: 'DONE' | 'PENDING', bookedAt, cents,
 * ccy, from: {name, phone}, to: {name, phone}, concept}`.
 */
export class FakeBankDialect implements BizumDialect {
  readonly id = 'fake';
  readonly displayName = 'Banco Ficticio';
  readonly bank: BankRef = { name: 'Banco Ficticio', country: 'ES' };

  recognise(raw: RawEntry, account: AccountRef): Recognised {
    const id = this.text(raw.id);
    const key = id === null ? null : new BizumKey(account.stableId, id);
    if (raw.kind !== 'BIZUM_IN' && raw.kind !== 'BIZUM_OUT') {
      return { kind: 'ignore', why: 'not_a_bizum', key };
    }
    if (raw.state !== 'DONE') {
      return { kind: 'ignore', why: 'pending', key: null };
    }
    if (key === null) return { kind: 'ignore', why: 'unidentified', key: null };
    try {
      return {
        kind: 'bizum',
        bizum: new Bizum({
          key,
          direction: raw.kind === 'BIZUM_IN' ? 'incoming' : 'outgoing',
          bookedOn: String(raw.bookedAt),
          amountCents: Number(raw.cents),
          currency: String(raw.ccy),
          sender: this.party(raw.from),
          receiver: this.party(raw.to),
          subject: this.text(raw.concept),
        }),
      };
    } catch {
      return { kind: 'ignore', why: 'not_a_bizum', key };
    }
  }

  /** Reads the aggregator's account shape: the `uid`, the stable hash and the `details`. */
  describeAccount(raw: RawAccount): AccountChoice {
    const details = (raw.details ?? {}) as Record<string, unknown>;
    const accountId = (details.account_id ?? {}) as Record<string, unknown>;
    const number = this.text(accountId.iban) ?? '';
    return {
      stableId: String(raw.identification_hash),
      sessionId: String(raw.uid),
      currency: String(details.currency),
      kind: String(details.cash_account_type),
      last4: number.slice(-4),
    };
  }

  private party(value: unknown): BizumParty {
    const party = (value ?? {}) as Record<string, unknown>;
    return { name: this.text(party.name), phone: this.text(party.phone) };
  }

  private text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }
}
