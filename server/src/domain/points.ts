import { seniorityPoints } from './seniority.js';
import type { ExclusionKind, SeasonRules } from './types.js';

export interface PointsInput {
  /** Games this player has PAID for. Paying for guests still scores 1. */
  paidGames: number;
  /** Exclusions of kind 'points' or 'demoted'. A mercy seat scores nothing. */
  exclusions: number;
  /** Seasons of seniority, including the current one. */
  seasons: number;
}

export interface PointsBreakdown {
  attendance: number;
  exclusions: number;
  seniority: number;
  total: number;
}

/** Only these exclusion kinds are worth a point. A mercy seat means you played. */
export function exclusionScores(kind: ExclusionKind): boolean {
  return kind === 'points' || kind === 'demoted';
}

/**
 * Puntos = Asistencia + FueraDeConvocatoria + Antigüedad.
 *
 * Attendance counts payments, not appearances: showing up without paying
 * ('*' in the legacy sheet) is a debt, and scores nothing until settled.
 */
export function computePoints(input: PointsInput): PointsBreakdown {
  const attendance = Math.max(0, input.paidGames);
  const exclusions = Math.max(0, input.exclusions);
  const seniority = seniorityPoints(input.seasons);
  return {
    attendance,
    exclusions,
    seniority,
    total: attendance + exclusions + seniority,
  };
}

/**
 * Games waited since the last mercy seat, from a player's exclusion history in
 * chronological order.
 *
 * `mercyResetsCounter` decides what a mercy seat does. The organiser's rule is a
 * reset to zero; the legacy script subtracts `gamesOutForMercy` instead, which
 * leaves a remainder behind for anyone who waited three or more games and makes
 * them eligible again sooner than they should be.
 */
export function waitCounter(
  history: ExclusionKind[],
  rules: Pick<SeasonRules, 'gamesOutForMercy' | 'mercyResetsCounter'>,
): number {
  let counter = 0;
  for (const kind of history) {
    if (kind === 'mercy') {
      // Not clamped at zero in legacy mode: the original script subtracts
      // unconditionally, so a counter can go negative. Reproduced faithfully.
      counter = rules.mercyResetsCounter ? 0 : counter - rules.gamesOutForMercy;
    } else if (exclusionScores(kind)) {
      counter += 1;
    }
  }
  return counter;
}

/** How many mercy seats a player has already had this season. */
export function mercyCount(history: ExclusionKind[]): number {
  return history.filter((k) => k === 'mercy').length;
}

/** How many times a player has been demoted this season. */
export function demotionCount(history: ExclusionKind[]): number {
  return history.filter((k) => k === 'demoted').length;
}
