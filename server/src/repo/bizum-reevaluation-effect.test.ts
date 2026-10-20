import { beforeEach, describe, expect, it } from 'vitest';
import { BizumFeedRig, FakeBankEntries } from './bizum-feed-test-support.js';

describe('BizumReevaluationEffect', () => {
  let rig: BizumFeedRig;
  let luis: number;

  beforeEach(async () => {
    rig = new BizumFeedRig();
    rig.connect();
    luis = rig.player('Luis Pérez', 'Luis P.R.');
    await rig.arrive(
      FakeBankEntries.incoming('r1', '2026-10-08', 400, { name: 'Luis P.R.' })
    );
  });

  const gameWithLuis = (playedOn: string) => {
    const gameId = rig.flow.games.create(rig.seasonId, playedOn).id;
    rig.flow.participations.set(gameId, luis, { signed_up: true });
    rig.flow.confirmed(gameId);
    return gameId;
  };

  it('leaves the payment in place when the game is reopened', () => {
    const gameId = gameWithLuis('2026-10-07');
    rig.flow.play(gameId);

    rig.flow.reopen(gameId);

    expect(rig.payments()).toHaveLength(1);
    expect(rig.handlingOf('r1')).toMatchObject({ status: 'settled' });
  });

  it('rolls the whole play back when settling fails', () => {
    const gameId = gameWithLuis('2026-10-07');
    rig.conn.exec(
      `CREATE TRIGGER fail_payment BEFORE INSERT ON payments
       BEGIN SELECT RAISE(ABORT, 'boom'); END`
    );

    expect(() => rig.flow.play(gameId)).toThrow('boom');

    expect(rig.flow.games.get(gameId)?.status).toBe('convocatoria_confirmed');
    expect(rig.flow.debts.keysOf(gameId)).toHaveLength(0);
    expect(rig.handlingOf('r1')).toMatchObject({ status: 'waiting' });
  });

  it('does not look at a Bizum already settled', () => {
    rig.flow.play(gameWithLuis('2026-10-07'));
    const before = rig.payments();

    rig.flow.play(gameWithLuis('2026-10-06'));

    expect(rig.payments()).toEqual(before);
  });
});
