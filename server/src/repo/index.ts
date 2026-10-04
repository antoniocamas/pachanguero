import { db } from '../db/index.js';
import { PointsCalculator } from '../domain/points.js';
import { ConvocatoriaBuilder } from '../domain/convocatoria.js';
import { SeasonRepository } from './season-repository.js';
import { PlayerRepository } from './player-repository.js';
import { AliasRepository } from './alias-repository.js';
import { PlayerRegistrar } from './player-registrar.js';
import { GameRepository } from './game-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { FinalListTargetResolver } from './final-list-target-resolver.js';
import { GuestCandidateRepository } from './guest-candidate-repository.js';
import { CandidateResolutionService } from './candidate-resolution-service.js';
import { CandidateLineParser } from '../domain/candidate-line-parser.js';
import { GuestSlotAllocator } from '../domain/guest-slot-allocator.js';
import { NameStripper } from '../domain/name-stripper.js';
import { GameDayResolutionService } from './game-day-resolution-service.js';
import { ParticipationRepository } from './participation-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { StandingsService } from './standings-service.js';
import { ConvocatoriaService } from './convocatoria-service.js';

export const seasons = new SeasonRepository(db());
export const players = new PlayerRepository(db());
export const aliases = new AliasRepository(db());
export const playerRegistrar = new PlayerRegistrar(players, aliases);
export const games = new GameRepository(db());
export const schedule = new ScheduleRepository(db());
export const participations = new ParticipationRepository(db());
export const exclusions = new ExclusionRepository(db());

export const standingsService = new StandingsService(
  players,
  exclusions,
  seasons,
  new PointsCalculator(),
  db()
);

export const gameDayResolution = new GameDayResolutionService(
  games,
  schedule,
  seasons
);

export const finalListTarget = new FinalListTargetResolver(games, schedule);

export const guestCandidates = new GuestCandidateRepository(db());

export const candidateResolution = new CandidateResolutionService(
  games,
  gameDayResolution,
  players,
  aliases,
  participations,
  guestCandidates,
  new CandidateLineParser(new NameStripper()),
  playerRegistrar,
  db()
);

export const convocatoriaService = new ConvocatoriaService(
  games,
  participations,
  exclusions,
  standingsService,
  new ConvocatoriaBuilder(),
  seasons,
  guestCandidates,
  players,
  new GuestSlotAllocator(),
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
