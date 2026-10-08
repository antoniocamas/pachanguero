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

const isLineOf = (row: CandidateRow, entry: UnresolvedEntry) =>
  row.position === entry.line.position;

/** The list with the named player chosen for one name of a line. */
export const withLink = (
  rows: readonly CandidateRow[],
  entry: UnresolvedEntry,
  playerId: number
): CandidateLine[] =>
  rows.map(r =>
    isLineOf(r, entry)
      ? { ...lineOf(r), links: { ...r.links, [entry.field]: playerId } }
      : lineOf(r)
  );

/** The list with one name marked as registered by its own line as its host's guest. */
export const withIntroduced = (
  rows: readonly CandidateRow[],
  entry: UnresolvedEntry
): CandidateLine[] =>
  rows.map(r =>
    isLineOf(r, entry) ? { ...lineOf(r), introduced: true as const } : lineOf(r)
  );

/**
 * The list once a line's name has been settled by registering a new player:
 * the line is linked to them, since the name they were registered under may
 * not be the one written on the line, and marked as their host's guest when
 * the line named a host.
 */
export const withRegistered = (
  rows: readonly CandidateRow[],
  entry: UnresolvedEntry,
  playerId: number
): CandidateLine[] => {
  const linked = withLink(rows, entry, playerId);
  const guest = entry.field === 'name' && entry.line.kind === 'hostAnnotated';
  return linked.map((line, i) =>
    guest && isLineOf(rows[i], entry)
      ? { ...line, introduced: true as const }
      : line
  );
};
