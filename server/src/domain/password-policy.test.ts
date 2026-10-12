import { describe, expect, it } from 'vitest';
import { PasswordPolicy } from './password-policy.js';

describe('PasswordPolicy', () => {
  const policy = new PasswordPolicy();

  it.each([
    ['Gol-7', ['length'], 'too short'],
    ['gol-del-miercoles7', ['uppercase'], 'no uppercase letter'],
    ['GOL-DEL-MIERCOLES7', ['lowercase'], 'no lowercase letter'],
    ['Gol-del-miercoles', ['digit'], 'no digit'],
    ['Goldelmiercoles77', ['special'], 'no special character'],
  ])('%s breaks only its own rule (%s)', (password, expected) => {
    expect(policy.violations(password)).toEqual(expected);
  });

  it('accepts a password that meets every rule', () => {
    expect(policy.violations('Gol-del-Miercoles7')).toEqual([]);
    expect(policy.violations('Penalti-en-Mayo42')).toEqual([]);
  });

  it('lists every rule a password breaks', () => {
    expect(policy.violations('gol')).toEqual([
      'length',
      'uppercase',
      'digit',
      'special',
    ]);
  });

  it('accepts twelve characters and refuses eleven', () => {
    expect(policy.violations('Abcdefghi-1k')).toEqual([]);
    expect(policy.violations('Abcdefgh-1k')).toEqual(['length']);
  });

  it('says each rule in Spanish', () => {
    for (const rule of [
      'length',
      'uppercase',
      'lowercase',
      'digit',
      'special',
    ] as const) {
      expect(policy.describe(rule)).toMatch(/^Debe tener/);
    }
  });
});
