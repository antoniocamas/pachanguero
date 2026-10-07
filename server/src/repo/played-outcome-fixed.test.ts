import { describe, expect, it } from 'vitest';
import { GameFlow } from './game-flow-test-support.js';

describe('Marking a game played and paying its 14', () => {
  it('scores the 14 who paid, and points the 2 left out', () => {
    const flow = new GameFlow();
    const { gameId, playerIds } = flow.gameWithSignups('2025-10-08', 16);
    const playing = playerIds.slice(0, 14);
    const left = playerIds.slice(14);

    flow.played(gameId);
    for (const id of playing)
      flow.paymentService.pay(gameId, {
        shares: [{ playerId: id }],
        payerPlayerId: id,
      });

    const standings = flow.standings.standings(flow.seasonId);
    expect(standings.filter(s => playing.includes(s.playerId))).toSatisfy(
      (rows: typeof standings) =>
        rows.length === 14 &&
        rows.every(
          s =>
            s.paidGames === 1 &&
            s.exclusions === 0 &&
            s.attendance === 1 &&
            s.points === 2 &&
            s.gamesPlayed === 1 &&
            s.debtCents === 0
        )
    );
    expect(standings.filter(s => left.includes(s.playerId))).toSatisfy(
      (rows: typeof standings) =>
        rows.length === 2 &&
        rows.every(
          s =>
            s.paidGames === 0 &&
            s.exclusions === 1 &&
            s.attendance === 0 &&
            s.points === 2 &&
            s.gamesPlayed === 0
        )
    );
    expect(flow.exclusionRows(gameId)).toEqual(
      left.map(player_id => ({ player_id, kind: 'points' }))
    );
    expect(flow.playedIds(gameId)).toEqual(playing);
  });
});
