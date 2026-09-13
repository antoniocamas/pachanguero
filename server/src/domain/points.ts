import { SeniorityCurve } from './seniority.js';

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

/**
 * Puntos = Asistencia + FueraDeConvocatoria + Antigüedad.
 *
 * Attendance counts payments, not appearances: showing up without paying
 * ('*' in the legacy sheet) is a debt, and scores nothing until settled.
 */
export class PointsCalculator {
  constructor(
    private readonly seniority: SeniorityCurve = new SeniorityCurve()
  ) {}

  compute(input: PointsInput): PointsBreakdown {
    const attendance = Math.max(0, input.paidGames);
    const exclusions = Math.max(0, input.exclusions);
    const seniority = this.seniority.total(input.seasons);
    return {
      attendance,
      exclusions,
      seniority,
      total: attendance + exclusions + seniority,
    };
  }
}
