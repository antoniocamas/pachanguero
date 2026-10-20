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
import { CallUpStat } from './call-up-stat.js';
import { MercySeasonStat } from './mercy-season-stat.js';
import { PointsSeasonStat } from './points-season-stat.js';
import { PaymentStat } from './payment-stat.js';
import { PlayerReportService } from './player-report-service.js';
import { DebtRepository } from './debt-repository.js';
import { GameLifecycleService } from './game-lifecycle-service.js';
import { ConvocatoriaRepository } from './convocatoria-repository.js';
import { ConvocatoriaEditService } from './convocatoria-edit-service.js';
import { ConvocatoriaHistoryConverter } from './convocatoria-history-converter.js';
import { BillingPlanner } from '../domain/billing-planner.js';
import { BillingEffect } from './billing-effect.js';
import { PaymentRepository } from './payment-repository.js';
import { PaymentService } from './payment-service.js';
import { ShareSettler } from './share-settler.js';
import { TeamAssignmentService } from './team-assignment-service.js';
import { TeamPasteService } from './team-paste-service.js';
import { GameViewService } from './game-view-service.js';
import { PlayedDerivation } from '../domain/played-derivation.js';
import { PlayedOutcomeEffect } from './played-outcome-effect.js';
import { ConvocatoriaService } from './convocatoria-service.js';
import { SystemClock } from '../domain/clock.js';
import { BizumRuleSet } from '../domain/bizum-rules.js';
import { SqliteBankEntryLedger } from '../bizum/sqlite/sqlite-bank-entry-ledger.js';
import { SqliteBizumStore } from '../bizum/sqlite/sqlite-bizum-store.js';
import { BankSettingsRepository } from './bank-settings-repository.js';
import { BizumFactsReader } from './bizum-facts-reader.js';
import { BizumHandlingRepository } from './bizum-handling-repository.js';
import { BizumReevaluationEffect } from './bizum-reevaluation-effect.js';
import { BizumUndoService } from './bizum-undo-service.js';
import { PaymentDetailService } from './payment-detail-service.js';
import { BizumResolutionService } from './bizum-resolution-service.js';
import { BizumSettlementService } from './bizum-settlement-service.js';
import { ContactRepository } from './contact-repository.js';
import { KeywordRepository } from './keyword-repository.js';
import { SenderPairingService } from './sender-pairing-service.js';
import { UserRepository } from './user-repository.js';
import { RefreshTokenRepository } from './refresh-token-repository.js';

export const seasons = new SeasonRepository(db());
export const players = new PlayerRepository(db());
export const aliases = new AliasRepository(db());
export const playerEdit = new PlayerEditService(players, aliases, db());
export const users = new UserRepository(db());
export const refreshTokens = new RefreshTokenRepository(db());
export const playerMerge = new PlayerMergeService(
  players,
  aliases,
  users,
  db()
);
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

export const shareSettler = new ShareSettler(
  games,
  debtRepository,
  paymentRepository,
  participations,
  players,
  seasons
);

const bizumClock = new SystemClock();
export const bizumHandling = new BizumHandlingRepository(db());
const bizumStore = new SqliteBizumStore(db(), bizumClock);
const contactRepository = new ContactRepository(db());
const bizumFacts = new BizumFactsReader(
  seasons,
  players,
  aliases,
  contactRepository,
  debtRepository,
  new KeywordRepository(db(), new BankSettingsRepository(db()))
);

const bizumSettlement = new BizumSettlementService(
  shareSettler,
  bizumHandling,
  bizumClock
);

export const bizumResolution = new BizumResolutionService(
  bizumStore,
  new SqliteBankEntryLedger(db(), bizumClock),
  bizumHandling,
  bizumFacts,
  new BizumRuleSet(),
  bizumSettlement,
  players,
  db()
);

export const senderPairing = new SenderPairingService(
  bizumStore,
  bizumHandling,
  bizumResolution,
  bizumFacts,
  players,
  contactRepository,
  db()
);

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
    new BizumReevaluationEffect(bizumHandling, bizumResolution),
  ],
  db()
);

export const playerReport = new PlayerReportService(
  [new CallUpStat(db()), new PaymentStat(db())],
  [
    new PointsSeasonStat(standingsService),
    new MercySeasonStat(exclusions, seasons),
  ],
  seasons,
  db()
);

export const paymentService = new PaymentService(
  gameLifecycle,
  paymentRepository,
  shareSettler,
  db()
);

export const bizumUndo = new BizumUndoService(
  gameLifecycle,
  paymentRepository,
  shareSettler,
  paymentService,
  bizumStore,
  bizumFacts,
  bizumSettlement,
  db()
);

export const paymentDetail = new PaymentDetailService(
  paymentRepository,
  games,
  players,
  bizumStore,
  bizumHandling
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
