import { describe, expect, it } from 'vitest';
import type { PlayerReport } from '../api';
import { gamesToShow } from './playerReport';

const game = (gameId: number, seasonId: number) => ({
  gameId,
  seasonId,
  playedOn: '2026-03-01',
  label: null,
  season: String(seasonId),
  played: true,
  stats: {},
});

const report: Pick<PlayerReport, 'games' | 'season'> = {
  season: { id: 2, name: '2025/2026' },
  games: [game(3, 2), game(2, 2), game(1, 1)],
};

describe('gamesToShow', () => {
  it('keeps only the current season by default', () => {
    expect(gamesToShow(report, false).map(g => g.gameId)).toEqual([3, 2]);
  });

  it('adds the other seasons when asked', () => {
    expect(gamesToShow(report, true).map(g => g.gameId)).toEqual([3, 2, 1]);
  });

  it('shows every game when there is no current season', () => {
    expect(
      gamesToShow({ ...report, season: null }, false).map(g => g.gameId)
    ).toEqual([3, 2, 1]);
  });
});
