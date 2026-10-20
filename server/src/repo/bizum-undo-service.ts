import type Database from 'better-sqlite3';
import type { BizumStore } from '../bizum/ports.js';
import type { BizumFactsReader } from './bizum-facts-reader.js';
import type { BizumSettlementService } from './bizum-settlement-service.js';
import type { GameLifecycleService } from './game-lifecycle-service.js';
import type { PaymentRepository } from './payment-repository.js';
import type { PaymentService } from './payment-service.js';
import type { ShareSettler } from './share-settler.js';

/**
 * Undoes a payment. One made by hand goes to `PaymentService`, as always. One a Bizum made undoes
 * every payment of that Bizum, from any game, in one transaction, or refuses them all; the Bizum
 * then waits again, as an ordinary waiting Bizum whose reason is that its payments were undone.
 */
export class BizumUndoService {
  constructor(
    private readonly lifecycle: GameLifecycleService,
    private readonly payments: PaymentRepository,
    private readonly settler: ShareSettler,
    private readonly manual: PaymentService,
    private readonly store: BizumStore,
    private readonly facts: BizumFactsReader,
    private readonly settlement: BizumSettlementService,
    private readonly conn: Database.Database
  ) {}

  undoPayment(gameId: number, paymentId: number): void {
    const payment = this.payments.find(paymentId);
    if (!payment || payment.game_id !== gameId) {
      throw new Error('Ese pago no es de este partido');
    }
    if (payment.bizum_id === null) {
      this.manual.undo(gameId, paymentId);
      return;
    }
    const bizumId = payment.bizum_id;
    const all = this.payments.byBizum(bizumId);
    for (const game of new Set(all.map(p => p.game_id))) {
      this.lifecycle.require(game, 'pay');
    }
    this.conn.transaction(() => {
      for (const each of all) this.settler.unsettle(each);
      const stored = this.store.find(bizumId);
      if (stored !== null) {
        this.settlement.wait(
          stored,
          { code: 'undone' },
          this.facts.identify(stored.bizum.sender)
        );
      }
    })();
  }
}
