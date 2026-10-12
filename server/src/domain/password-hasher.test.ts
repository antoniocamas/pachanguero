import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher(2 ** 10);

  it('verifies the password it hashed and refuses another', async () => {
    const stored = await hasher.hash('Gol-del-Miercoles7');
    expect(await hasher.verify('Gol-del-Miercoles7', stored)).toBe(true);
    expect(await hasher.verify('Gol-del-Miercoles8', stored)).toBe(false);
  });

  it('gives two different hashes for one password', async () => {
    expect(await hasher.hash('Gol-del-Miercoles7')).not.toBe(
      await hasher.hash('Gol-del-Miercoles7')
    );
  });

  it('stores six fields, with the cost in them', async () => {
    const fields = (await hasher.hash('Gol-del-Miercoles7')).split('$');
    expect(fields).toHaveLength(6);
    expect(fields.slice(0, 4)).toEqual(['scrypt', '1024', '8', '1']);
  });

  it('verifies a hash made at another cost, reading the cost from the stored text', async () => {
    const stored = await new PasswordHasher(2 ** 11).hash('Gol-del-Miercoles7');
    expect(await hasher.verify('Gol-del-Miercoles7', stored)).toBe(true);
  });

  it.each([
    [''],
    ['plain text'],
    ['scrypt$x$8$1$AA==$AA=='],
    ['scrypt$1024$8$1$AA==$AA==$extra'],
  ])(
    'returns false, without throwing, for the stored text %j',
    async stored => {
      expect(await hasher.verify('Gol-del-Miercoles7', stored)).toBe(false);
    }
  );

  it('burns time without a result and without throwing', async () => {
    await expect(hasher.burn('Gol-del-Miercoles7')).resolves.toBeUndefined();
  });
});
