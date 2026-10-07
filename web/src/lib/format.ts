import type { Team } from '../api';

/** `8.1` → `8,1`; two decimals at most, none when whole. */
export const fmtPoints = (points: number): string =>
  String(Math.round(points * 100) / 100).replace('.', ',');

export const TEAM_LABEL: Record<Team, string> = {
  claros: 'Claros',
  oscuros: 'Oscuros',
};
