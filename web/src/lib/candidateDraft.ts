import type { CandidateLine, CandidateRow, UnresolvedEntry } from '../api';

const lineOf = (row: CandidateRow): CandidateLine => ({
  text: row.text,
  ...(row.links && { links: row.links }),
  ...(row.introduced && { introduced: true as const }),
});

/** The lines of a list, which is all the server needs to read it back. */
export const rowLines = (rows: readonly CandidateRow[]): CandidateLine[] =>
  rows.map(lineOf);

/** Whether the list on screen differs from the one last saved. */
export const hasUnsavedChanges = (
  rows: readonly CandidateRow[],
  saved: readonly CandidateLine[]
): boolean => JSON.stringify(rowLines(rows)) !== JSON.stringify(saved);

/** The list with the named player chosen for one unresolved name. */
export const withLink = (
  rows: readonly CandidateRow[],
  entry: UnresolvedEntry,
  playerId: number
): CandidateLine[] =>
  rows.map(r =>
    r.status === 'unresolved' && r.entry === entry
      ? { ...lineOf(r), links: { ...r.links, [entry.field]: playerId } }
      : lineOf(r)
  );

/** The list with one unresolved name marked as registered by its own line as its host's guest. */
export const withIntroduced = (
  rows: readonly CandidateRow[],
  entry: UnresolvedEntry
): CandidateLine[] =>
  rows.map(r =>
    r.status === 'unresolved' && r.entry === entry
      ? { ...lineOf(r), introduced: true as const }
      : lineOf(r)
  );
