import { beforeEach, describe, expect, it } from 'vitest';
import { GameFlow } from './game-flow-test-support.js';

describe('PlayedOutcomeEffect', () => {
  let flow: GameFlow;
  let gameId: number;
  let ids: number[];

  beforeEach(() => {
    flow = new GameFlow();
    ({ gameId, playerIds: ids } = flow.gameWithSignups('2025-10-08', 16));
  });

  it('records who played and gives an exclusion point to those left out', () => {
    flow.played(gameId);

    expect(flow.playedIds(gameId)).toEqual(ids.slice(0, 14));
    expect(flow.exclusionRows(gameId)).toEqual([
      { player_id: ids[14], kind: 'points' },
      { player_id: ids[15], kind: 'points' },
    ]);
  });

  it('writes nothing until the game is played', () => {
    flow.confirmed(gameId);

    expect(flow.playedIds(gameId)).toEqual([]);
    expect(flow.exclusionRows(gameId)).toEqual([]);
  });

  it('counts no paid game for a player who played and has not paid', () => {
    flow.played(gameId);

    const row = flow.standings
      .standings(flow.seasonId)
      .find(s => s.playerId === ids[0])!;
    expect(row).toMatchObject({ paidGames: 0, gamesPlayed: 1 });
  });

  it('retracts played and exclusion points on reopen but keeps payments', () => {
    flow.played(gameId);
    flow.participations.set(gameId, ids[0], { paid_cents: 400 });

    flow.reopen(gameId);

    expect(flow.playedIds(gameId)).toEqual([]);
    expect(flow.exclusionRows(gameId)).toEqual([]);
    expect(
      flow.participations.list(gameId).find(p => p.player_id === ids[0])
    ).toMatchObject({ paid_cents: 400 });
  });

  it('retracts on cancel and restores on undoing the cancel', () => {
    flow.played(gameId);

    flow.lifecycle.perform(gameId, 'cancel');
    expect(flow.playedIds(gameId)).toEqual([]);
    expect(flow.exclusionRows(gameId)).toEqual([]);

    flow.lifecycle.perform(gameId, 'uncancel');
    expect(flow.playedIds(gameId)).toEqual(ids.slice(0, 14));
    expect(flow.exclusionRows(gameId)).toHaveLength(2);
  });

  it('recomputes after a hand swap when played again', () => {
    flow.played(gameId);
    flow.reopen(gameId);
    flow.edits.move(gameId, { playerId: ids[2] }, false);
    flow.edits.move(gameId, { playerId: ids[14] }, true);

    flow.play(gameId);

    expect(flow.playedIds(gameId)).toEqual(
      [...ids.slice(0, 14).filter(id => id !== ids[2]), ids[14]].sort(
        (a, b) => a - b
      )
    );
    expect(flow.exclusionRows(gameId)).toEqual([
      { player_id: ids[2], kind: 'points' },
      { player_id: ids[15], kind: 'points' },
    ]);
  });

  it('leaves a point from an earlier game standing when a later game is reopened', () => {
    flow.played(gameId);
    const second = flow.gameWithSignups('2025-10-15', 16).gameId;
    flow.played(second);

    flow.reopen(second);

    expect(flow.exclusionRows(gameId)).toHaveLength(2);
  });
});
