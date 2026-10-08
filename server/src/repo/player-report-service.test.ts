import { describe, expect, it } from 'vitest';
import { CallUpStat } from './call-up-stat.js';
import { GameFlow } from './game-flow-test-support.js';
import { MercySeasonStat } from './mercy-season-stat.js';
import { PaymentStat } from './payment-stat.js';
import { PlayerReportService } from './player-report-service.js';
import { PointsSeasonStat } from './points-season-stat.js';

const serviceOf = (flow: GameFlow) =>
  new PlayerReportService(
    [new CallUpStat(flow.conn), new PaymentStat(flow.conn)],
    [
      new PointsSeasonStat(flow.standings),
      new MercySeasonStat(flow.exclusions, flow.seasons),
    ],
    flow.seasons,
    flow.conn
  );

describe('PlayerReportService', () => {
  it('lists the games a player played, newest first, with paid or owed', () => {
    const flow = new GameFlow();
    const first = flow.gameWithSignups('2026-10-07', 14);
    const second = flow.gameWithSignups('2026-10-14', 14);
    flow.played(first.gameId);
    flow.played(second.gameId);
    const [id] = first.playerIds;
    flow.paymentService.pay(first.gameId, {
      shares: [{ playerId: id }],
      payerPlayerId: id,
      paidOn: '2026-10-08',
    });

    const report = serviceOf(flow).report(id, '2026-10-20');

    expect(report.games.map(g => g.playedOn)).toEqual([
      '2026-10-14',
      '2026-10-07',
    ]);
    const stats = report.games.find(g => g.gameId === first.gameId)!.stats;
    expect(stats.payment).toMatchObject({
      status: 'paid',
      paidOn: '2026-10-08',
    });
    expect(stats.callUp).toBe('played');
    expect(report.summary.gamesPlayed).toBe(2);
    expect(report.summary.payment).toMatchObject({ paid: 1, owed: 1 });
  });

  it('shows the games the player was left out of, and this season’s points and mercy progress', () => {
    const flow = new GameFlow();
    const { gameId, playerIds } = flow.gameWithSignups('2026-03-07', 15);
    flow.played(gameId);
    const [{ player_id: outId }] = flow.conn
      .prepare('SELECT player_id FROM exclusions WHERE game_id = ?')
      .all(gameId) as Array<{ player_id: number }>;
    expect(playerIds).toContain(outId);

    const report = serviceOf(flow).report(outId, '2026-03-20');

    expect(report.games).toHaveLength(1);
    expect(report.games[0]).toMatchObject({ played: false });
    expect(report.games[0].stats.callUp).toBe('out');
    expect(report.summary.gamesPlayed).toBe(0);
    expect(report.season?.name).toBe('2025/2026');
    expect(report.seasonStats.points).toMatchObject({
      exclusions: 1,
      paidGames: 0,
    });
    expect(report.seasonStats.mercy).toMatchObject({
      outOnPoints: 1,
      mercySeats: 0,
      demotions: 0,
      gamesUntilMercy: 1,
    });
  });

  it('summarises only the current season, though it lists every season', () => {
    const flow = new GameFlow();
    const old = flow.seasons.create({ name: '2024/2025' }).id;
    const lastYear = flow.games.create(old, '2025-03-05').id;
    const { gameId, playerIds } = flow.gameWithSignups('2026-03-07', 14);
    flow.conn
      .prepare("UPDATE games SET status = 'played' WHERE id = ?")
      .run(lastYear);
    flow.participations.set(lastYear, playerIds[0], { played: true });
    flow.played(gameId);

    const report = serviceOf(flow).report(playerIds[0], '2026-03-20');

    expect(report.games).toHaveLength(2);
    expect(report.summary.gamesPlayed).toBe(1);
  });

  it('has no season stats outside any season', () => {
    const flow = new GameFlow();
    const { gameId, playerIds } = flow.gameWithSignups('2026-10-07', 14);
    flow.played(gameId);
    const report = serviceOf(flow).report(playerIds[0], '2030-01-01');
    expect(report.season).toBeNull();
    expect(report.seasonStats).toEqual({});
  });

  it('refuses a player that does not exist', () => {
    const flow = new GameFlow();
    expect(() => serviceOf(flow).report(999, '2026-10-20')).toThrow('Jugador');
  });
});
