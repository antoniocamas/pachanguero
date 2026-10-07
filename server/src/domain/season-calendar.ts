/**
 * A season runs from 1 September to 31 August. The season is identified by the
 * calendar year it starts in, so bounds never depend on when games were played.
 */
export class SeasonCalendar {
  boundsFor(startYear: number): { startsOn: string; endsOn: string } {
    return {
      startsOn: `${startYear}-09-01`,
      endsOn: `${startYear + 1}-08-31`,
    };
  }

  /** The name of the season a date falls in: `2026-10-05` is `2026/2027`, `2027-03-01` too. */
  nameFor(isoDate: string): string {
    const year = Number(isoDate.slice(0, 4));
    const month = Number(isoDate.slice(5, 7));
    const startYear = month >= 9 ? year : year - 1;
    return `${startYear}/${startYear + 1}`;
  }
}
