import { describe, expect, it } from 'vitest';
import { EffectiveRole } from './effective-role.js';

describe('EffectiveRole', () => {
  it('is admin only for an admin looking at the admin view', () => {
    const role = new EffectiveRole('admin', 'admin');
    expect(role.value()).toBe('admin');
    expect(role.isAdmin()).toBe(true);
    expect(role.isRegular()).toBe(false);
  });

  it('is regular for an admin looking at the regular view', () => {
    const role = new EffectiveRole('admin', 'regular');
    expect(role.value()).toBe('regular');
    expect(role.isRegular()).toBe(true);
  });

  it('is regular for a regular user, whatever the view says', () => {
    expect(new EffectiveRole('regular', 'regular').value()).toBe('regular');
    expect(new EffectiveRole('regular', 'admin').value()).toBe('regular');
  });
});
