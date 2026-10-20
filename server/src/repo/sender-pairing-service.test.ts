import { beforeEach, describe, expect, it } from 'vitest';
import { BizumFeedRig, FakeBankEntries } from './bizum-feed-test-support.js';

describe('SenderPairingService', () => {
  let rig: BizumFeedRig;
  let luis: number;

  const pairing = () => rig.flow.senderPairing;

  beforeEach(() => {
    rig = new BizumFeedRig();
    rig.connect();
    luis = rig.player('Luis Pérez');
  });

  it('says nothing was replaced when the player already had the same name', async () => {
    rig.flow.senderPairing.setBizumName(luis, 'Luis P.R.');
    await rig.arrive(
      FakeBankEntries.incoming('r1', '2026-10-08', 800, { name: 'Luis P.R.' })
    );

    expect(pairing().pair(rig.idOf('r1'), luis).replaced).toBeNull();
  });

  it('says which phone a phone pairing replaced', async () => {
    rig.flow.contacts.save(luis, { phone: '+34699999999' });
    await rig.arrive(
      FakeBankEntries.incoming('r1', '2026-10-08', 800, {
        phone: '+34600000000',
      })
    );

    const result = pairing().pair(rig.idOf('r1'), luis);

    expect(result.replaced).toBe('+34699999999');
  });

  it('warns when another player holds the same phone', async () => {
    const other = rig.player('Otro');
    rig.flow.contacts.save(other, { phone: '+34600000000' });
    await rig.arrive(
      FakeBankEntries.incoming('r1', '2026-10-08', 800, {
        phone: '+34 600 000 000',
      })
    );

    expect(pairing().pair(rig.idOf('r1'), luis).sharedWith).toEqual([
      { playerId: other, name: 'Otro' },
    ]);
  });

  it('refuses a Bizum that is gone and a player that is not there', async () => {
    await rig.arrive(
      FakeBankEntries.incoming('r1', '2026-10-08', 800, { name: 'Luis P.R.' })
    );

    expect(() => pairing().pair(999, luis)).toThrow('No existe ese Bizum');
    expect(() => pairing().pair(rig.idOf('r1'), 999)).toThrow(
      'No existe ese jugador'
    );
    expect(() => pairing().setBizumName(999, 'x')).toThrow('No existe');
    expect(() => pairing().clearBizumName(999)).toThrow('No existe');
  });

  it('keeps a typed name trimmed, clears a blank one, and refuses one over 80 characters', () => {
    pairing().setBizumName(luis, '  Jorge G.A. ');
    expect(rig.flow.players.bizumNameOf(luis)).toBe('Jorge G.A.');

    pairing().setBizumName(luis, '   ');
    expect(rig.flow.players.bizumNameOf(luis)).toBeNull();

    expect(() => pairing().setBizumName(luis, 'x'.repeat(81))).toThrow(
      'no puede pasar de 80'
    );
  });

  it('lists the pairings by player name', () => {
    const ana = rig.player('Ana');
    pairing().setBizumName(luis, 'Luis P.R.');
    pairing().setBizumName(ana, 'Ana M.');

    expect(
      pairing()
        .pairings()
        .map(p => p.playerName)
    ).toEqual(['Ana', 'Luis Pérez']);
  });

  it('judges nothing when a name is typed by hand', async () => {
    rig.owes(luis, '2026-10-05');
    await rig.arrive(
      FakeBankEntries.incoming('r1', '2026-10-08', 400, { name: 'Luis P.R.' })
    );

    pairing().setBizumName(luis, 'Luis P.R.');

    expect(rig.handlingOf('r1')).toMatchObject({ status: 'waiting' });
  });
});
