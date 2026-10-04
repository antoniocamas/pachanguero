import { ScheduleResolver } from '../domain/schedule-resolver.js';
import type { GameRepository, GameRow } from './game-repository.js';
import type { ScheduleRepository } from './schedule-repository.js';

/**
 * Finds the game a final list with no explicit target belongs to: the latest
 * game still missing its final list, except that today's game only becomes
 * eligible once kickoff plus one hour has passed.
 */
export class FinalListTargetResolver {
  constructor(
    private readonly games: GameRepository,
    private readonly schedule: ScheduleRepository
  ) {}

  resolve(now: Date = new Date()): GameRow | undefined {
    const today = this.localDate(now);
    const [first, ...rest] = this.games.unresolvedOnOrBefore(today);
    if (!first) return undefined;
    if (first.played_on === today && !this.pastCutoff(today, now)) {
      return rest[0];
    }
    return first;
  }

  /** Without any schedule there is no kickoff to wait for. */
  private pastCutoff(gameDate: string, now: Date): boolean {
    const rows = this.schedule.list();
    if (rows.length === 0) return true;
    const cutoff = new ScheduleResolver(rows).cutoffFor(gameDate);
    return this.localDateTime(now) >= cutoff;
  }

  // Kickoff times are wall-clock, so compare against local wall-clock time.
  private localDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private localDateTime(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${this.localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
