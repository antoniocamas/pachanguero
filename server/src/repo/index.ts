import { db } from '../db/index.js';
import { PointsCalculator } from '../domain/points.js';
import { ConvocatoriaBuilder } from '../domain/convocatoria.js';
import { SeasonRepository } from './season-repository.js';
import { PlayerRepository } from './player-repository.js';
import { GameRepository } from './game-repository.js';
import { ParticipationRepository } from './participation-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { StandingsService } from './standings-service.js';
import { ConvocatoriaService } from './convocatoria-service.js';

export const seasons = new SeasonRepository(db());
export const players = new PlayerRepository(db());
export const games = new GameRepository(db());
export const participations = new ParticipationRepository(db());
export const exclusions = new ExclusionRepository(db());

export const standingsService = new StandingsService(
  players,
  exclusions,
  seasons,
  new PointsCalculator(),
  db()
);

export const convocatoriaService = new ConvocatoriaService(
  games,
  participations,
  exclusions,
  standingsService,
  new ConvocatoriaBuilder(),
  seasons,
  db()
);

export type { SeasonRow, NewSeasonInput } from './season-repository.js';
export type { PlayerRow } from './player-repository.js';
export type { GameRow } from './game-repository.js';
export type {
  ParticipationRow,
  ParticipationPatch,
} from './participation-repository.js';
export type { Standing } from './standings-service.js';
