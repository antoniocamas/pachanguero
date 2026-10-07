import type Database from 'better-sqlite3';
import type { ConvocatoriaRepository } from './convocatoria-repository.js';
import type { ConvocatoriaService } from './convocatoria-service.js';
import type { GameRepository } from './game-repository.js';

export interface HistoryConversion {
  converted: number[];
  skipped: number[];
}

/**
 * Gives every played game of a season a stored, confirmed convocatoria, as the
 * selection would have made it with the points of that moment. Nothing about
 * who played, who paid or the exclusions is touched: history stays as it was.
 */
export class ConvocatoriaHistoryConverter {
  constructor(
    private readonly games: GameRepository,
    private readonly convocatorias: ConvocatoriaRepository,
    private readonly service: ConvocatoriaService,
    private readonly conn: Database.Database
  ) {}

  /**
   * One transaction: if the selection cannot be computed for any game the
   * whole conversion is undone and the error names that game.
   */
  convertSeason(seasonId: number): HistoryConversion {
    const result: HistoryConversion = { converted: [], skipped: [] };
    this.conn.transaction(() => {
      for (const game of this.games.list(seasonId)) {
        if (game.status !== 'played' || this.convocatorias.find(game.id)) {
          result.skipped.push(game.id);
          continue;
        }
        try {
          this.service.store(game.id, 'history');
        } catch (e) {
          throw new Error(
            `No se pudo convertir el partido ${game.id} (${game.played_on}): ${(e as Error).message}`,
            { cause: e }
          );
        }
        this.convocatorias.confirm(game.id);
        result.converted.push(game.id);
      }
    })();
    return result;
  }
}
