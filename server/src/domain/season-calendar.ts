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
}
