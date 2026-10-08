import { db } from '../db/index.js';
import { PointsCalculator } from '../domain/points.js';
import { ConvocatoriaBuilder } from '../domain/convocatoria.js';
import { SeasonRepository } from './season-repository.js';
import { PlayerRepository } from './player-repository.js';
import { AliasRepository } from './alias-repository.js';
import { PlayerEditService } from './player-edit-service.js';
import { PlayerMergeService } from './player-merge-service.js';
import { PlayerRegistrar } from './player-registrar.js';
import { GameRepository } from './game-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { LineResolver } from './line-resolver.js';
import { TeamListParser } from '../domain/team-list-parser.js';
import { CandidateLineRepository } from './candidate-line-repository.js';
import { GuestCandidateRepository } from './guest-candidate-repository.js';
import { CandidateResolutionService } from './candidate-resolution-service.js';
import { CandidateLineParser } from '../domain/candidate-line-parser.js';
import { GuestSlotAllocator } from '../domain/guest-slot-allocator.js';
import { NameStripper } from '../domain/name-stripper.js';
import { GameDayResolutionService } from './game-day-resolution-service.js';
import { ParticipationRepository } from './participation-repository.js';
import { ExclusionRepository } from './exclusion-repository.js';
import { StandingsService } from './standings-service.js';
import { GameLifecycle } from '../domain/game-lifecycle.js';
import { DebtRepository } from './debt-repository.js';
import { GameLifecycleService } from './game-lifecycle-service.js';
import { ConvocatoriaRepository } from './convocatoria-repository.js';
import { ConvocatoriaEditService } from './convocatoria-edit-service.js';
import { ConvocatoriaHistoryConverter } from './convocatoria-history-converter.js';
import { BillingPlanner } from '../domain/billing-planner.js';
import { BillingEffect } from './billing-effect.js';
import { PaymentRepository } from './payment-repository.js';
import { PaymentService } from './payment-service.js';
import { TeamAssignmentService } from './team-assignment-service.js';
import { TeamPasteService } from './team-paste-service.js';
import { GameViewService } from './game-view-service.js';
import { PlayedDerivation } from '../domain/played-derivation.js';
import { PlayedOutcomeEffect } from './played-outcome-effect.js';
import { ConvocatoriaService } from './convocatoria-service.js';

export const seasons = new SeasonRepository(db());
export const players = new PlayerRepository(db());
export const aliases = new AliasRepository(db());
export const playerEdit = new PlayerEditService(players, aliases, db());
export const playerMerge = new PlayerMergeService(players, aliases, db());
export const playerRegistrar = new PlayerRegistrar(players, aliases);
export const games = new GameRepository(db());
export const schedule = new ScheduleRepository(db());
export const participations = new ParticipationRepository(db());
export const exclusions = new ExclusionRepository(db());

export const debtRepository = new DebtRepository(db());

export const standingsService = new StandingsService(
  players,
  exclusions,
  debtRepository,
  new PointsCalculator(),
  db()
);

export const gameDayResolution = new GameDayResolutionService(
  games,
  schedule,
  seasons
);

export const guestCandidates = new GuestCandidateRepository(db());

export const convocatoriaRepository = new ConvocatoriaRepository(db());

export const paymentRepository = new PaymentRepository(db());

export const gameLifecycle = new GameLifecycleService(
  games,
  new GameLifecycle(),
  debtRepository,
  [
    new PlayedOutcomeEffect(
      convocatoriaRepository,
      new PlayedDerivation(),
      participations,
      exclusions
    ),
    new BillingEffect(
      convocatoriaRepository,
      guestCandidates,
      debtRepository,
      paymentRepository,
      seasons,
      new BillingPlanner()
    ),
  ],
  db()
);

export const paymentService = new PaymentService(
  games,
  gameLifecycle,
  debtRepository,
  paymentRepository,
  participations,
  players,
  seasons,
  db()
);

export const convocatoriaEdit = new ConvocatoriaEditService(
  games,
  convocatoriaRepository,
  gameLifecycle,
  standingsService,
  players,
  db()
);

export const candidateResolution = new CandidateResolutionService(
  games,
  gameDayResolution,
  players,
  aliases,
  participations,
  guestCandidates,
  new CandidateLineRepository(db()),
  new CandidateLineParser(new NameStripper()),
  playerRegistrar,
  gameLifecycle,
  convocatoriaEdit,
  db()
);

export const teamAssignment = new TeamAssignmentService(
  gameLifecycle,
  convocatoriaRepository,
  participations,
  players,
  db()
);

export const teamPaste = new TeamPasteService(
  gameLifecycle,
  teamAssignment,
  new LineResolver(players, aliases, playerRegistrar),
  new TeamListParser(new NameStripper()),
  new CandidateLineParser(new NameStripper())
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
  convocatoriaRepository,
  gameLifecycle
);

export const gameView = new GameViewService(
  games,
  gameLifecycle,
  participations,
  convocatoriaService,
  debtRepository,
  paymentRepository,
  candidateResolution,
  standingsService
);

export const convocatoriaHistoryConverter = new ConvocatoriaHistoryConverter(
  games,
  convocatoriaRepository,
  convocatoriaService,
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
