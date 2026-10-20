import { beforeEach, describe, expect, it } from 'vitest';
import { BankError } from '../bizum/ports.js';
import { BizumFeedRig } from './bizum-feed-test-support.js';

describe('BankFeedSource', () => {
  let rig: BizumFeedRig;
  const source = () =>
    // The poller asks its provider; the rig's poller is built over a real BankFeedSource.
    rig.poller.requestRead();

  beforeEach(() => {
    rig = new BizumFeedRig();
  });

  it('reads nothing while the setup is incomplete', async () => {
    expect(await source()).toEqual({
      kind: 'refused',
      refusal: { code: 'not_ready' },
    });
    expect(rig.connector.read).toEqual([]);
  });

  it('reads the chosen account from the start date, deep the first time', async () => {
    rig.connect('2026-09-01');

    await source();

    expect(rig.connector.read).toEqual([
      { account: BizumFeedRig.ACCOUNT, dateFrom: '2026-09-01', deep: true },
    ]);
  });

  it('reads the ordinary way once the whole history has been read', async () => {
    rig.connect();
    await source();
    rig.clock.advance(10 * 60_000);

    await source();

    expect(rig.connector.read.map(r => r.deep)).toEqual([true, false]);
  });

  it('reads the whole history again with a new session', async () => {
    rig.connect();
    await source();
    rig.clock.advance(10 * 60_000);
    rig.connect();

    await source();

    expect(rig.connector.read.map(r => r.deep)).toEqual([true, true]);
  });

  it('does not count a failed read as the deep one', async () => {
    rig.connect();
    rig.connector.failNext(new BankError('unavailable', 'TIMEOUT'), 'entries');
    await source();
    rig.clock.advance(10 * 60_000);

    await source();

    expect(rig.connector.read.map(r => r.deep)).toEqual([true]);
  });

  it('tells the connection when the session has ended', async () => {
    rig.connect();
    rig.connector.failNext(
      new BankError('session_ended', 'CLOSED_SESSION'),
      'entries'
    );

    await source();

    expect(rig.endings.ended).toEqual(['CLOSED_SESSION']);
  });

  it('hands every failure to the connection, which decides what ends the session', async () => {
    rig.connect();
    rig.connector.failNext(new BankError('unavailable', 'TIMEOUT'), 'entries');

    await source();

    expect(rig.endings.ended).toEqual(['TIMEOUT']);
  });
});
