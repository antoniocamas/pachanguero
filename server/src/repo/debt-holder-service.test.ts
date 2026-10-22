import { beforeEach, describe, expect, it } from 'vitest';
import { BizumFeedRig, FakeBankEntries } from './bizum-feed-test-support.js';
import { DebtHolderService } from './debt-holder-service.js';

describe('DebtHolderService', () => {
  let rig: BizumFeedRig;
  let service: DebtHolderService;
  let luis: number;
  let ana: number;
  let beto: number;
  let gameId: number;

  const debtOf = (playerId: number) =>
    rig.flow.debts
      .list(gameId)
      .find(d => d.beneficiary_player_id === playerId)!;

  beforeEach(() => {
    rig = new BizumFeedRig();
    rig.connect();
    service = new DebtHolderService(
      rig.flow.lifecycle,
      rig.flow.games,
      rig.flow.debts,
      rig.flow.players,
      rig.flow.bizumHandling,
      rig.flow.bizumResolution,
      rig.conn
    );
    luis = rig.player('Luis Pérez', 'Luis P.R.');
    ana = rig.player('Ana López');
    beto = rig.player('Beto Ruiz');
    gameId = rig.flow.games.create(rig.seasonId, '2026-10-07').id;
    for (const id of [luis, ana, beto])
      rig.flow.participations.set(gameId, id, { signed_up: true });
    rig.flow.played(gameId);
  });

  it('makes another player answer for a share, which stays its beneficiary’s', () => {
    service.reassign(gameId, debtOf(ana).id, luis);

    expect(debtOf(ana)).toMatchObject({
      holder_player_id: luis,
      beneficiary_player_id: ana,
    });
  });

  it('lets one Bizum of three shares pay for the two players it now answers for', async () => {
    await rig.arrive(
      FakeBankEntries.incoming('r1', '2026-10-08', 1200, { name: 'Luis P.R.' })
    );
    expect(rig.handlingOf('r1')).toMatchObject({ status: 'waiting' });

    service.reassign(gameId, debtOf(ana).id, luis);
    expect(rig.handlingOf('r1')).toMatchObject({ status: 'waiting' });
    service.reassign(gameId, debtOf(beto).id, luis);

    expect(rig.handlingOf('r1')).toMatchObject({ status: 'settled' });
    expect(rig.payments()).toHaveLength(3);
    expect(rig.flow.debts.list(gameId)).toEqual([]);
    const paid = rig.flow.participations
      .list(gameId)
      .map(p => [p.player_id, p.paid_cents]);
    expect(paid).toEqual(
      expect.arrayContaining([
        [ana, 400],
        [beto, 400],
        [luis, 400],
      ])
    );
  });

  it('refuses a debt of another game, a plus-one and an unknown player', () => {
    const debt = debtOf(ana);
    expect(() => service.reassign(gameId + 1, debt.id, luis)).toThrow();
    expect(() => service.reassign(gameId, debt.id, 9999)).toThrow(
      'Unknown player'
    );
    rig.flow.debts.insert(
      gameId,
      { hostPlayerId: luis, ordinal: 1 },
      luis,
      400
    );
    const plusOne = rig.flow.debts
      .list(gameId)
      .find(d => d.guest_ordinal === 1)!;
    expect(() => service.reassign(gameId, plusOne.id, ana)).toThrow('+1');
  });

  it('refuses while the game is not played', () => {
    rig.flow.reopen(gameId);
    expect(() => service.reassign(gameId, debtOf(ana).id, luis)).toThrow(
      'jugado'
    );
  });
});
