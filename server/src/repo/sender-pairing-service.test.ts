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
    rig.flow.senderPairing.addBizumName(luis, 'Luis P.R.');
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
    expect(() => pairing().addBizumName(999, 'x')).toThrow('No existe');
    expect(() => pairing().removeBizumName(999, 'x')).toThrow('No existe');
  });

  it('keeps a typed name trimmed, refuses a blank one and one over 80 characters', () => {
    pairing().addBizumName(luis, '  Jorge G.A. ');
    expect(rig.flow.players.bizumNamesOf(luis)).toEqual(['Jorge G.A.']);

    expect(() => pairing().addBizumName(luis, '   ')).toThrow(
      'Indica el nombre de Bizum'
    );
    expect(() => pairing().addBizumName(luis, 'x'.repeat(81))).toThrow(
      'no puede pasar de 80'
    );
    expect(rig.flow.players.bizumNamesOf(luis)).toEqual(['Jorge G.A.']);
  });

  it('lists the pairings by player name', () => {
    const ana = rig.player('Ana');
    pairing().addBizumName(luis, 'Luis P.R.');
    pairing().addBizumName(ana, 'Ana M.');

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

    pairing().addBizumName(luis, 'Luis P.R.');

    expect(rig.handlingOf('r1')).toMatchObject({ status: 'waiting' });
  });

  describe('a player the bank shows under several names', () => {
    const adam = () => rig.player('Adam', 'ADAM RON B.');

    it('keeps the name he had and adds the new one, replacing nothing', async () => {
      const a = adam();
      await rig.arrive(
        FakeBankEntries.incoming('r1', '2026-10-08', 800, {
          name: 'ADAM RON B.R.',
        })
      );

      const result = pairing().pair(rig.idOf('r1'), a);

      expect(result.replaced).toBeNull();
      expect(rig.flow.players.bizumNamesOf(a)).toEqual([
        'ADAM RON B.',
        'ADAM RON B.R.',
      ]);
      expect(pairing().pairings()).toEqual([
        { playerId: a, playerName: 'Adam', bizumName: 'ADAM RON B.' },
        { playerId: a, playerName: 'Adam', bizumName: 'ADAM RON B.R.' },
      ]);
    });

    it('identifies both senders as him, and settles the Bizums of each', async () => {
      const a = adam();
      rig.owes(a, '2026-10-05');
      rig.owes(a, '2026-10-06');
      await rig.arrive(
        FakeBankEntries.incoming('r1', '2026-10-08', 400, {
          name: 'ADAM RON B.R.',
        }),
        FakeBankEntries.incoming('r2', '2026-10-09', 400, {
          name: 'ADAM RON B.',
        })
      );

      pairing().pair(rig.idOf('r1'), a);

      expect(rig.handlingOf('r1')).toMatchObject({ status: 'settled' });
      expect(rig.handlingOf('r2')).toMatchObject({ status: 'settled' });
    });

    it('does not add a name he already has in other capitals or accents', () => {
      const a = adam();

      pairing().addBizumName(a, 'adam ron b.');

      expect(rig.flow.players.bizumNamesOf(a)).toEqual(['ADAM RON B.']);
    });

    it('removes one name and keeps the other, and the payments stay', async () => {
      const a = adam();
      pairing().addBizumName(a, 'ADAM RON B.R.');

      pairing().removeBizumName(a, 'ADAM RON B.');

      expect(rig.flow.players.bizumNamesOf(a)).toEqual(['ADAM RON B.R.']);
    });

    it('is not ambiguous with himself when two of his names look alike', async () => {
      const a = adam();
      rig.flow.players.addBizumName(a, 'Adam Ron B.');
      await rig.arrive(
        FakeBankEntries.incoming('r1', '2026-10-08', 400, {
          name: 'ADAM RON B.',
        })
      );

      expect(rig.flow.bizumResolution.waiting()[0].senderIdentity).toEqual({
        kind: 'player',
        playerId: a,
      });
    });
  });
});
