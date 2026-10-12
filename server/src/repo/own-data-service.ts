import type { Clock } from '../domain/clock.js';
import { LocalCalendar } from '../domain/local-calendar.js';
import {
  OwnDisclosure,
  type OwnDebts,
  type OwnPaymentRow,
} from '../domain/own-disclosure.js';
import type { DebtRepository } from './debt-repository.js';
import type { PaymentRepository } from './payment-repository.js';
import type {
  PlayerReport,
  PlayerReportService,
} from './player-report-service.js';

/** What a player is told about their own money and statistics, by the disclosure rules. */
export class OwnDataService {
  private readonly calendar = new LocalCalendar();

  constructor(
    private readonly debtRepository: DebtRepository,
    private readonly paymentRepository: PaymentRepository,
    private readonly reports: PlayerReportService,
    private readonly clock: Clock
  ) {}

  debts(playerId: number): OwnDebts {
    return new OwnDisclosure(playerId).debts(
      this.debtRepository.outstandingFor(playerId)
    );
  }

  payments(playerId: number): OwnPaymentRow[] {
    return new OwnDisclosure(playerId).payments(
      this.paymentRepository.paidFor(playerId)
    );
  }

  report(playerId: number): PlayerReport {
    return new OwnDisclosure(playerId).report(
      this.reports.report(playerId, this.calendar.dateOf(this.clock.now()))
    );
  }
}
