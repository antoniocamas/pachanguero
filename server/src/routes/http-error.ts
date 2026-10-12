import type { NextFunction, Request, Response } from 'express';

/** An error that already knows the status and the JSON body it should be answered with. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

/** Router-level error middleware: answers an `HttpError`, hands anything else on untouched. */
export class HttpErrorHandler {
  handler() {
    return (err: unknown, _req: Request, res: Response, next: NextFunction) => {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message, ...err.extra });
      } else {
        next(err);
      }
    };
  }
}
