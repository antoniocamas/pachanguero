/** The current moment, injected so time-dependent code can be driven by a test. */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
