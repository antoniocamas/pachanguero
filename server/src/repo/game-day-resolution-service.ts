import { ScheduleResolver } from '../domain/schedule-resolver.js';
import type { GameRepository, GameRow } from './game-repository.js';
import type { ScheduleRepository } from './schedule-repository.js';
import type { SeasonRepository } from './season-repository.js';

/** Turns the date a list was pasted into the game it belongs to. */
export class GameDayResolutionService {
  constructor(
    private readonly games: GameRepository,
    private readonly schedule: ScheduleRepository,
    private readonly seasons: SeasonRepository
  ) {}

  /** The next game day on or after `pasteDate`, creating its game if new. */
  resolveTarget(pasteDate: string): GameRow {
    const resolver = new ScheduleResolver(this.schedule.list());
    const gameDate = resolver.nextOccurrenceOnOrAfter(pasteDate);
    const season = this.seasons.current(gameDate);
    if (!season) throw new Error(`No season covers ${gameDate}`);
    return this.games.findOrCreate(season.id, gameDate);
  }
}
