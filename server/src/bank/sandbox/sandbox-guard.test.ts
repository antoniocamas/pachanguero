import { describe, expect, it } from 'vitest';
import {
  SandboxGuard,
  SandboxSettings,
} from './sandbox-settings-test-support.js';

describe('SandboxSettings', () => {
  const complete = {
    ENABLE_BANKING_SANDBOX: '1',
    ENABLE_BANKING_SANDBOX_APP_ID: 'sandbox-app',
    ENABLE_BANKING_SANDBOX_PRIVATE_KEY: 'sandbox-key',
    ENABLE_BANKING_SANDBOX_SESSION_ID: 'session',
    ENABLE_BANKING_SANDBOX_ACCOUNT_UID: 'uid',
    ENABLE_BANKING_SANDBOX_ACCOUNT_HASH: 'hash',
    ENABLE_BANKING_SANDBOX_DATE_FROM: '2026-01-01',
    ENABLE_BANKING_SANDBOX_EXPECTED_COUNT: '130',
  };

  it('skips with a message naming the switch when it is not 1', () => {
    expect(SandboxSettings.fromEnv({}).skipMessage()).toContain(
      'ENABLE_BANKING_SANDBOX=1'
    );
    expect(
      SandboxSettings.fromEnv({
        ...complete,
        ENABLE_BANKING_SANDBOX: 'true',
      }).skipMessage()
    ).toContain('ENABLE_BANKING_SANDBOX=1');
  });

  it('skips with a message naming every variable that is missing', () => {
    const message = SandboxSettings.fromEnv({
      ENABLE_BANKING_SANDBOX: '1',
      ENABLE_BANKING_SANDBOX_APP_ID: 'x',
    }).skipMessage();
    expect(message).toContain('ENABLE_BANKING_SANDBOX_PRIVATE_KEY');
    expect(message).toContain('ENABLE_BANKING_SANDBOX_EXPECTED_COUNT');
    expect(message).not.toContain('ENABLE_BANKING_SANDBOX_APP_ID,');
  });

  it('runs when everything is set', () => {
    const settings = SandboxSettings.fromEnv(complete);
    expect(settings.skipMessage()).toBeNull();
    expect(settings.expectedCount).toBe(130);
    expect(settings.accountUid).toBe('uid');
  });
});

describe('SandboxGuard', () => {
  const settings = (over: Record<string, string> = {}) =>
    SandboxSettings.fromEnv({
      ENABLE_BANKING_SANDBOX: '1',
      ENABLE_BANKING_SANDBOX_APP_ID: 'sandbox-app',
      ENABLE_BANKING_SANDBOX_PRIVATE_KEY: 'sandbox-key',
      ENABLE_BANKING_SANDBOX_SESSION_ID: 's',
      ENABLE_BANKING_SANDBOX_ACCOUNT_UID: 'u',
      ENABLE_BANKING_SANDBOX_ACCOUNT_HASH: 'h',
      ENABLE_BANKING_SANDBOX_DATE_FROM: '2026-01-01',
      ENABLE_BANKING_SANDBOX_EXPECTED_COUNT: '130',
      ...over,
    });
  const guard = (
    over: Record<string, string> = {},
    production = { appId: 'prod-app', privateKey: 'prod-key' }
  ) => new SandboxGuard(settings(over), production);

  it('lets a separate sandbox application through', () => {
    expect(guard().refusal()).toBeNull();
  });

  it('refuses the production application id', () => {
    expect(
      guard({ ENABLE_BANKING_SANDBOX_APP_ID: 'prod-app' }).refusal()
    ).toContain('production');
  });

  it('refuses the production key, however its line breaks are written', () => {
    const production = { appId: 'prod-app', privateKey: 'a\nb' };
    expect(
      guard(
        { ENABLE_BANKING_SANDBOX_PRIVATE_KEY: 'a\\nb' },
        production
      ).refusal()
    ).toContain('production');
  });

  it('does not take an unset production pair for a match', () => {
    expect(guard({}, { appId: '', privateKey: '' }).refusal()).toBeNull();
  });

  it.each(['0', 'many', ''])('refuses an expected count of %j', count => {
    expect(
      guard({ ENABLE_BANKING_SANDBOX_EXPECTED_COUNT: count }).refusal()
    ).not.toBeNull();
  });

  it('accepts only an authorised session', () => {
    expect(guard().sessionRefusal(200, { status: 'AUTHORIZED' })).toBeNull();
    expect(guard().sessionRefusal(200, { status: 'CLOSED' })).not.toBeNull();
    expect(guard().sessionRefusal(404, {})).not.toBeNull();
  });

  it('stops when the fixture changed', () => {
    expect(guard().fixtureRefusal(130)).toBeNull();
    expect(guard().fixtureRefusal(131)).toContain('fixture changed');
  });
});
