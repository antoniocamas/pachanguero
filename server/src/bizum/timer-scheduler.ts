import type { Scheduler } from './bank-poller.js';

/** Schedules with the platform's timers; they never keep the process alive. */
export class TimerScheduler implements Scheduler {
  after(ms: number, task: () => void): () => void {
    const timer = setTimeout(task, ms);
    timer.unref();
    return () => clearTimeout(timer);
  }
}
