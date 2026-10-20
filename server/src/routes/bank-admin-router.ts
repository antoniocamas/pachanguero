import { Router } from 'express';
import type { BankPoller } from '../bizum/bank-poller.js';
import {
  BankRefusal,
  type BankConnectionService,
} from '../repo/bank-connection-service.js';
import type {
  BankSettingsService,
  SettingsChange,
} from '../repo/bank-settings-service.js';
import { HttpError, type HttpErrorHandler } from './http-error.js';

/** The organiser's routes for the bank access. Mounted behind the admin guard. */
export class BankAdminRouter {
  constructor(
    private readonly bank: BankConnectionService,
    private readonly settings: BankSettingsService,
    private readonly poller: BankPoller,
    private readonly errors: HttpErrorHandler
  ) {}

  router(): Router {
    const router = Router();
    router.get('/bank', (_req, res) => {
      res.json(this.panel());
    });
    router.put('/bank/settings', (req, res) => {
      this.refusedNow(() => this.settings.update(this.changeIn(req.body)));
      res.json(this.panel());
    });
    router.put('/bank/words', (req, res) => {
      const { include, exclude } = this.listsIn(req.body);
      this.refusedNow(() => this.settings.replaceWords(include, exclude));
      res.json(this.panel());
    });
    router.post('/bank/connect', async (_req, res) => {
      res.json(await this.refused(() => this.bank.connect()));
    });
    router.post('/bank/disconnect', async (_req, res) => {
      await this.refused(() => this.bank.disconnect());
      res.json(this.panel());
    });
    router.get('/bank/banner', (_req, res) => {
      res.json({
        ...this.bank.banner(),
        canRead: this.settings.readiness().ready(),
      });
    });
    router.post('/bank/read', async (_req, res) => {
      const outcome = await this.poller.requestRead();
      if (outcome.kind === 'read') {
        res.json(outcome.counts);
      } else if (outcome.kind === 'refused') {
        const { code, ...rest } = outcome.refusal;
        res.status(409).json({ refusal: code, ...rest });
      } else {
        res.status(502).json({ failure: outcome.failure, code: outcome.code });
      }
    });
    router.use(this.errors.handler());
    return router;
  }

  /** The connection's panel with the settings' part, which says which bank, account and words. */
  private panel() {
    return {
      ...this.bank.panel(),
      ...this.settings.panelPart(),
      lastRead: this.poller.lastRead(),
    };
  }

  private changeIn(body: unknown): SettingsChange {
    const fields = ['bankId', 'currency', 'accountStableId', 'startDate'];
    const given = typeof body === 'object' && body !== null ? body : {};
    const change: Record<string, string> = {};
    for (const [key, value] of Object.entries(given)) {
      if (!fields.includes(key)) continue;
      if (typeof value !== 'string') {
        throw new HttpError(400, 'Datos no válidos');
      }
      change[key] = value;
    }
    return change;
  }

  private listsIn(body: unknown): { include: string[]; exclude: string[] } {
    const given = (typeof body === 'object' && body !== null ? body : {}) as {
      include?: unknown;
      exclude?: unknown;
    };
    const words = (value: unknown): string[] => {
      if (!Array.isArray(value) || value.some(w => typeof w !== 'string')) {
        throw new HttpError(400, 'Palabra no válida');
      }
      return value;
    };
    return { include: words(given.include), exclude: words(given.exclude) };
  }

  private async refused<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      throw this.refusal(error);
    }
  }

  private refusedNow(action: () => void): void {
    try {
      action();
    } catch (error) {
      throw this.refusal(error);
    }
  }

  private refusal(error: unknown): unknown {
    return error instanceof BankRefusal
      ? new HttpError(400, error.message)
      : error;
  }
}
