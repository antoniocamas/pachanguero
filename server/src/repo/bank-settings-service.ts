import type { BankCatalogue } from '../bank/bank-catalogue.js';
import type { BizumDialect } from '../bizum/ports.js';
import {
  AccountSelection,
  type Selection,
} from '../domain/account-selection.js';
import type { Clock } from '../domain/clock.js';
import { ConnectionClock } from '../domain/connection-clock.js';
import {
  ReadingReadiness,
  type ReadingMissing,
} from '../domain/reading-readiness.js';
import { TextFolding } from '../domain/text-folding.js';
import type { AccountChoice } from '../bizum/ports.js';
import type { BankConnectionRepository } from './bank-connection-repository.js';
import { BankRefusal, type BankChoice } from './bank-connection-service.js';
import {
  BankSettingsRepository,
  type StoredBankSettings,
} from './bank-settings-repository.js';
import type { KeywordRepository } from './keyword-repository.js';

/** Which of the settings the organiser changes; a field left out is kept. */
export interface SettingsChange {
  bankId?: string;
  currency?: string;
  accountStableId?: string;
  startDate?: string;
}

export interface SettingsPanelPart {
  bank: {
    chosenId: string | null;
    options: { id: string; displayName: string }[];
    editable: boolean;
  };
  currency: string;
  accounts: (Pick<AccountChoice, 'stableId' | 'currency' | 'kind' | 'last4'> & {
    chosen: boolean;
  })[];
  selection: { kind: Selection['kind']; stableId: string | null };
  startDate: string | null;
  words: { include: string[]; exclude: string[] };
  readiness: { ready: boolean; missing: ReadingMissing[] };
}

/**
 * What is read and how: the bank, the currency, the account, the start date and the two word
 * lists, with the rules of when each may change. It is the bank the connection asks for.
 */
export class BankSettingsService implements BankChoice {
  private static readonly MAX_WORD = 40;
  private static readonly DATE = /^\d{4}-\d{2}-\d{2}$/;

  private readonly folding = new TextFolding();

  constructor(
    private readonly settings: BankSettingsRepository,
    private readonly keywords: KeywordRepository,
    private readonly connections: BankConnectionRepository,
    private readonly catalogue: BankCatalogue,
    private readonly clock: Clock
  ) {}

  /** The stored bank, the catalogue's default when none is stored, null when the stored one is gone. */
  current(): BizumDialect | null {
    const stored = this.settings.get().bankId;
    return this.catalogue.find(stored ?? this.catalogue.defaultId());
  }

  /** The currency read. */
  currency(): string {
    return this.settings.get().currency;
  }

  /** The day from which what is booked counts, or null while none is set. */
  startDate(): string | null {
    return this.settings.get().startDate;
  }

  /** The account to read, or null while the selection does not give one. */
  readingAccount(): AccountChoice | null {
    const selection = this.selection();
    return selection.kind === 'account' ? selection.account : null;
  }

  readiness(): ReadingReadiness {
    const stored = this.connections.get();
    const status =
      stored === null
        ? 'none'
        : stored.state === 'reconnect_needed' ||
            new ConnectionClock(stored.validUntil, this.clock.now()).passed()
          ? 'reconnect_needed'
          : 'connected';
    return new ReadingReadiness(
      status,
      this.selection(),
      this.settings.get().startDate
    );
  }

  /** Applies the changes, all or none, refusing in words. */
  update(change: SettingsChange): void {
    const current = this.settings.get();
    const next: Partial<StoredBankSettings> = {};
    if (change.bankId !== undefined) next.bankId = this.bankIn(change.bankId);
    if (change.currency !== undefined) {
      next.currency = this.currencyIn(change.currency);
    }
    if (change.accountStableId !== undefined) {
      next.accountStableId = this.accountIn(
        change.accountStableId,
        next.currency ?? current.currency
      );
    }
    if (change.startDate !== undefined) {
      next.startDate = this.dateIn(change.startDate);
    }
    this.settings.update(next);
  }

  /** Replaces both lists whole. */
  replaceWords(include: readonly string[], exclude: readonly string[]): void {
    this.keywords.replace(this.wordsIn(include), this.wordsIn(exclude));
  }

  panelPart(): SettingsPanelPart {
    const stored = this.settings.get();
    const connection = this.connections.get();
    const selection = this.selection();
    const chosen = selection.kind === 'account' ? selection.account : null;
    const readiness = this.readiness();
    return {
      bank: {
        chosenId: this.current()?.id ?? null,
        options: this.catalogue.list(),
        editable: connection === null,
      },
      currency: stored.currency,
      accounts: (connection?.accounts ?? []).map(account => ({
        stableId: account.stableId,
        currency: account.currency,
        kind: account.kind,
        last4: account.last4,
        chosen: chosen?.stableId === account.stableId,
      })),
      selection: { kind: selection.kind, stableId: chosen?.stableId ?? null },
      startDate: stored.startDate,
      words: {
        include: this.keywords.include(),
        exclude: this.keywords.exclude(),
      },
      readiness: { ready: readiness.ready(), missing: readiness.missing() },
    };
  }

  private selection(): Selection {
    const stored = this.settings.get();
    return new AccountSelection(
      this.connections.get()?.accounts ?? null,
      stored.currency,
      stored.accountStableId
    ).select();
  }

  private bankIn(id: string): string {
    if (this.connections.get() !== null) {
      throw new BankRefusal('Desconecta antes de cambiar de banco');
    }
    if (this.catalogue.find(id) === null) {
      throw new BankRefusal('Banco no disponible');
    }
    return id;
  }

  private currencyIn(value: string): string {
    const currency = value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BankRefusal('Moneda no válida');
    return currency;
  }

  private accountIn(stableId: string, currency: string): string {
    const among = (this.connections.get()?.accounts ?? []).some(
      account =>
        account.stableId === stableId &&
        account.currency.toUpperCase() === currency
    );
    if (!among) {
      throw new BankRefusal('Esa cuenta no está entre las de la conexión');
    }
    return stableId;
  }

  private dateIn(value: string): string {
    const parsed = new Date(`${value}T00:00:00Z`);
    const real =
      BankSettingsService.DATE.test(value) &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value;
    if (!real) throw new BankRefusal('Fecha no válida');
    if (value > this.clock.now().toISOString().slice(0, 10)) {
      throw new BankRefusal('La fecha no puede ser futura');
    }
    return value;
  }

  /** Each word trimmed, non-blank and short, and none a repeat of another once folded. */
  private wordsIn(words: readonly string[]): string[] {
    const initial = BankSettingsRepository.INITIAL_INCLUDE_WORDS;
    const kept: string[] = [];
    for (const raw of words) {
      const word = raw.trim();
      if (word === '' || word.length > BankSettingsService.MAX_WORD) {
        throw new BankRefusal('Palabra no válida');
      }
      const repeats = kept.some(
        other =>
          other === word ||
          (this.folding.same(other, word) &&
            !(initial.includes(other) && initial.includes(word)))
      );
      if (repeats) throw new BankRefusal('Ya está en la lista');
      kept.push(word);
    }
    return kept;
  }
}
