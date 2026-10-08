import { describe, expect, it } from 'vitest';
import type { CandidateRow, UnresolvedEntry } from '../api';
import { withRegistered } from './candidateDraft';

const entry: UnresolvedEntry = {
  line: { position: 2, kind: 'hostAnnotated', name: 'Javi', hostName: 'Caro' },
  field: 'name',
  reason: 'duplicate',
  candidates: [],
};
const rows = [
  { position: 1, text: 'Javi (Fer)' },
  { position: 2, text: 'Javi (Caro)', status: 'unresolved', entry },
] as unknown as CandidateRow[];

describe('withRegistered', () => {
  it('links only the line that registered the player, as its host guest', () => {
    expect(withRegistered(rows, entry, 9)).toEqual([
      { text: 'Javi (Fer)' },
      { text: 'Javi (Caro)', links: { name: 9 }, introduced: true },
    ]);
  });
});
