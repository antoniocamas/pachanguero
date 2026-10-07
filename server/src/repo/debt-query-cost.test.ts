import { beforeEach, describe, expect, it } from 'vitest';
import { GameFlow } from './game-flow-test-support.js';

/** The debt read must cost what is still owed, never the games already settled. */
describe('Debt read cost', () => {
  const GAMES = 12;
  let flow: GameFlow;
  let openGame: number;

  const planOf = (sql: string, ...params: unknown[]) =>
    (
      flow.conn.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{
        detail: string;
      }>
    )
      .map(r => r.detail)
      .join('\n');

  beforeEach(() => {
    flow = new GameFlow();
    for (let i = 0; i < GAMES; i++) {
      const { gameId, playerIds } = flow.gameWithSignups(
        `2026-10-${String(i + 1).padStart(2, '0')}`,
        14
      );
      flow.played(gameId);
      if (i < GAMES - 1)
        for (const id of playerIds)
          flow.paymentService.pay(gameId, {
            shares: [{ playerId: id }],
            payerPlayerId: id,
          });
      else openGame = gameId;
    }
  });

  it('keeps only unpaid shares in the debt table', () => {
    const [{ n }] = flow.conn
      .prepare('SELECT COUNT(*) AS n FROM share_debts')
      .all() as Array<{ n: number }>;
    expect(n).toBe(14);
    expect(flow.debts.list(openGame)).toHaveLength(14);
    expect(flow.debts.totalsByHolder(flow.seasonId).size).toBe(14);
  });

  it('reads a game debts through the game index, without touching participations', () => {
    const plan = planOf(
      'SELECT * FROM share_debts WHERE game_id = ? ORDER BY id',
      openGame
    );
    expect(plan).toContain(
      'SEARCH share_debts USING INDEX idx_share_debts_game'
    );
    expect(plan).not.toContain('participations');
    expect(plan).not.toMatch(/SCAN (share_debts|d)\b(?! USING)/);
  });

  it('sums the season debt from share_debts alone, through its indexes', () => {
    const plan = planOf(
      `SELECT d.holder_player_id AS holder, SUM(d.amount_cents) AS total
         FROM share_debts d JOIN games g ON g.id = d.game_id
        WHERE g.season_id = ? AND g.status = 'played'
        GROUP BY d.holder_player_id`,
      flow.seasonId
    );
    expect(plan).not.toContain('participations');
    expect(plan).not.toContain('payments');
    expect(plan).toContain('SEARCH d USING INDEX idx_share_debts_game');
    expect(plan).not.toMatch(/SCAN (share_debts|d)\s*$/m);
  });
});
