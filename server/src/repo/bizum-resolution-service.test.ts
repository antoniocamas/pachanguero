import { beforeEach, describe, expect, it } from 'vitest';
import { BizumFeedRig, FakeBankEntries } from './bizum-feed-test-support.js';

describe('BizumResolutionService', () => {
  let rig: BizumFeedRig;
  let luis: number;

  const resolution = () => rig.flow.bizumResolution;
  const arrive = (
    id: string,
    cents: number,
    from: { name?: string; phone?: string },
    concept: string | null = null,
    booked = '2026-10-12'
  ) => rig.arrive(FakeBankEntries.incoming(id, booked, cents, from, concept));

  beforeEach(() => {
    rig = new BizumFeedRig();
    rig.connect();
    luis = rig.player('Luis Pérez');
  });

  it('lists the oldest booking first', async () => {
    await arrive('late', 800, { phone: '+34611111111' }, null, '2026-10-12');
    await arrive('early', 800, { phone: '+34622222222' }, null, '2026-10-02');

    expect(
      resolution()
        .waiting()
        .map(w => w.bookedOn)
    ).toEqual(['2026-10-02', '2026-10-12']);
  });

  it('lists the open shares a Bizum could pay, nearest first, for a player not paired', async () => {
    const older = rig.owes(luis, '2026-10-05');
    const nearer = rig.owes(luis, '2026-10-06');
    rig.owes(luis, '2026-10-20');
    await arrive('r1', 800, { phone: '+34611111111' });

    const shares = resolution().openShares(rig.idOf('r1'), luis);

    expect(shares.map(s => s.gameId)).toEqual([nearer, older]);
  });

  it('rules for an unpaired sender without pairing it', async () => {
    rig.owes(luis, '2026-10-05');
    await arrive('r1', 800, { name: 'Luis P.R.' });

    resolution().rule(rig.idOf('r1'), luis, 1);

    expect(rig.flow.players.bizumNameOf(luis)).toBeNull();
    expect(rig.handlingOf('r1')).toMatchObject({
      settledHow: 'organiser',
      unallocatedCents: 400,
    });
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses %s shares', async shares => {
    rig.owes(luis, '2026-10-05');
    await arrive('r1', 800, { name: 'Luis P.R.' });

    expect(() => resolution().rule(rig.idOf('r1'), luis, shares)).toThrow(
      'Indica cuántas cuotas paga el Bizum'
    );
  });

  it('refuses a ruling when the player has no open share', async () => {
    await arrive('r1', 800, { name: 'Luis P.R.' });

    expect(() => resolution().rule(rig.idOf('r1'), luis, 1)).toThrow(
      'Solo tiene 0 cuotas abiertas en esa temporada'
    );
  });

  it('refuses what is not there: a Bizum, a player, a Bizum that no longer waits', async () => {
    rig.owes(luis, '2026-10-05');
    await arrive('r1', 800, { name: 'Luis P.R.' });
    const id = rig.idOf('r1');

    expect(() => resolution().rule(999, luis, 1)).toThrow(
      'No existe ese Bizum'
    );
    expect(() => resolution().rule(id, 999, 1)).toThrow(
      'No existe ese jugador'
    );
    resolution().rule(id, luis, 1);
    expect(() => resolution().rule(id, luis, 1)).toThrow(
      'Ese Bizum ya no está en espera'
    );
    expect(() => resolution().dismiss(999)).toThrow('No existe ese Bizum');
  });

  it('reevaluates only what still waits, and settles each against what the ones before took', async () => {
    rig.owes(luis, '2026-10-05');
    rig.flow.senderPairing.setBizumName(luis, 'Luis P.R.');
    await arrive('a', 400, { name: 'Luis P.R.' }, null, '2026-10-08');
    await arrive('b', 400, { name: 'Luis P.R.' }, null, '2026-10-09');
    const [a, b] = [rig.idOf('a'), rig.idOf('b')];

    expect(resolution().reevaluate([999, a, b, a])).toEqual([
      { bizumId: b, status: 'waiting' },
    ]);
  });
});
