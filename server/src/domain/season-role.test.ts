import { describe, expect, it } from 'vitest';
import {
  GuestClassifier,
  SeasonRoleError,
  SeasonRolePolicy,
  type GuestQuestion,
} from './season-role.js';

describe('SeasonRolePolicy', () => {
  const policy = new SeasonRolePolicy();

  it("is the season's written role when there is one", () => {
    expect(
      policy.roleOf({
        stored: 'invitado',
        previous: 'fijo',
        introducedBy: null,
      })
    ).toBe('invitado');
  });

  it('carries the latest earlier season when this one has none', () => {
    expect(
      policy.roleOf({ stored: null, previous: 'invitado', introducedBy: null })
    ).toBe('invitado');
  });

  it('makes someone new an invitado when somebody introduced them, a fijo otherwise', () => {
    expect(
      policy.roleOf({ stored: null, previous: null, introducedBy: 7 })
    ).toBe('invitado');
    expect(
      policy.roleOf({ stored: null, previous: null, introducedBy: null })
    ).toBe('fijo');
  });

  it('refuses to make an invitado of a fijo who has played as one this season', () => {
    expect(() => policy.checkChange('fijo', 'invitado', true, 'Adri')).toThrow(
      SeasonRoleError
    );
    expect(() =>
      policy.checkChange('fijo', 'invitado', false, 'Adri')
    ).not.toThrow();
    expect(() =>
      policy.checkChange('invitado', 'fijo', true, 'Adri')
    ).not.toThrow();
  });
});

describe('GuestClassifier', () => {
  const classifier = new GuestClassifier();
  const ask = (q: Partial<GuestQuestion>) =>
    classifier.classify({
      role: 'invitado',
      introduced: false,
      lineHost: null,
      usualHosts: [],
      introducedBy: null,
      ...q,
    });

  it('never makes a fijo a guest, whatever host the line names', () => {
    expect(ask({ role: 'fijo', lineHost: 2 })).toEqual({ kind: 'regular' });
  });

  it("makes a name the line registered its host's guest", () => {
    expect(ask({ role: 'fijo', introduced: true, lineHost: 2 })).toEqual({
      kind: 'guest',
      hostId: 2,
    });
  });

  it("an invitado comes with the line's host first, then the usual one, then who introduced them", () => {
    expect(ask({ lineHost: 2, usualHosts: [3], introducedBy: 4 })).toEqual({
      kind: 'guest',
      hostId: 2,
    });
    expect(ask({ usualHosts: [3, 5], introducedBy: 4 })).toEqual({
      kind: 'guest',
      hostId: 3,
    });
    expect(ask({ introducedBy: 4 })).toEqual({ kind: 'guest', hostId: 4 });
  });

  it('asks for a host when an invitado has none', () => {
    expect(ask({})).toEqual({ kind: 'needsHost' });
  });
});
