import type { BizumDialect } from '../bizum/ports.js';
import { RevolutDialect } from './revolut-dialect.js';

/** The banks the application can read, in the order they are offered; the first is the default. */
export class BankCatalogue {
  /** The banks production reads: adding one is a dialect class and a line here. */
  static production(): BankCatalogue {
    return new BankCatalogue([new RevolutDialect()]);
  }

  constructor(private readonly dialects: readonly BizumDialect[]) {
    if (dialects.length === 0) throw new Error('the catalogue lists no bank');
  }

  list(): { id: string; displayName: string }[] {
    return this.dialects.map(dialect => ({
      id: dialect.id,
      displayName: dialect.displayName,
    }));
  }

  find(id: string): BizumDialect | null {
    return this.dialects.find(dialect => dialect.id === id) ?? null;
  }

  defaultId(): string {
    return this.dialects[0].id;
  }
}
