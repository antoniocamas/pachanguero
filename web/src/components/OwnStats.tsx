import { useState } from 'react';
import type { PlayerReport } from '../api';
import { PlayerReportView } from './PlayerReportView';

/** The player's own report: the organiser's report of them, read only. */
export function OwnStats({ report }: { report: PlayerReport }) {
  const [allSeasons, setAllSeasons] = useState(false);
  return (
    <PlayerReportView
      report={report}
      allSeasons={allSeasons}
      onAllSeasons={setAllSeasons}
    />
  );
}
