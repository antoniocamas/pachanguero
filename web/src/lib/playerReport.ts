import type { PlayerReport } from '../api';

type ReportGame = PlayerReport['games'][number];

/**
 * The games the report page lists: this season's, or every season's when the
 * organiser asks. With no current season there is nothing to narrow to.
 */
export const gamesToShow = (
  report: Pick<PlayerReport, 'games' | 'season'>,
  allSeasons: boolean
): ReportGame[] =>
  report.games.filter(
    g => allSeasons || !report.season || g.seasonId === report.season.id
  );
