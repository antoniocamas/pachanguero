import { describe, expect, it } from 'vitest';
import { BackupName, type BackupKind } from './backup-name.js';

/**
 * The shipper's accepted pattern, copied from `NAME_RE` in the backup shipper's
 * `push-backups.sh` (trade4me-server, `k8s/charts/backup-shipper`). A name that does not
 * match is never shipped and never logged, so every name made here is run through it.
 */
const SHIPPER_NAME_RE =
  /^(release|periodic)_[0-9]{8}T[0-9]{6}Z_[A-Za-z0-9.+-]+\.[a-z0-9.]+$/;

// A backup name is one the shipper takes
describe('BackupName', () => {
  const at = new Date('2026-11-07T02:00:00.000Z');

  it('writes kind, UTC time and version', () => {
    expect(new BackupName('periodic', '0.3.1', at).fileName()).toBe(
      'periodic_20261107T020000Z_0.3.1.db'
    );
    expect(
      new BackupName(
        'release',
        '0.4.0',
        new Date('2026-11-07T09:30:15.999Z')
      ).fileName()
    ).toBe('release_20261107T093015Z_0.4.0.db');
  });

  it('says unreleased when the version is unset or empty', () => {
    const expected = 'periodic_20261107T020000Z_unreleased.db';
    expect(new BackupName('periodic', undefined, at).fileName()).toBe(expected);
    expect(new BackupName('periodic', '', at).fileName()).toBe(expected);
  });

  it('puts the counter in the version part, before the extension', () => {
    const name = new BackupName('periodic', '0.3.1', at);
    expect(name.fileName(1)).toBe('periodic_20261107T020000Z_0.3.1.db');
    expect(name.fileName(2)).toBe('periodic_20261107T020000Z_0.3.1-2.db');
  });

  it('hides the file while it is written', () => {
    const name = new BackupName('periodic', '0.3.1', at);
    expect(name.hiddenName()).toBe('.periodic_20261107T020000Z_0.3.1.db.part');
    expect(name.hiddenName(2)).toBe(
      '.periodic_20261107T020000Z_0.3.1-2.db.part'
    );
  });

  it.each(['0.3_1', 'a/b', '0.3 1', '../x', 'verñ'])(
    'rejects the version «%s»',
    version => {
      expect(() => new BackupName('periodic', version, at)).toThrow();
    }
  );

  it('gives the same name whatever the process time zone is', () => {
    const before = process.env.TZ;
    try {
      const names = ['Asia/Tokyo', 'America/Los_Angeles', 'UTC'].map(zone => {
        process.env.TZ = zone;
        return new BackupName('release', '0.4.0', at).fileName();
      });
      expect(new Set(names).size).toBe(1);
      expect(names[0]).toBe('release_20261107T020000Z_0.4.0.db');
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  describe('against the shipper pattern', () => {
    const kinds: BackupKind[] = ['periodic', 'release'];
    const versions = [undefined, '0.3.1', '1.0.0+build.5', '0.4.0-rc.1'];

    for (const kind of kinds) {
      for (const version of versions) {
        for (const counter of [1, 2, 17]) {
          it(`${kind} ${version ?? 'unset'} #${counter} is shipped`, () => {
            const name = new BackupName(kind, version, at);
            expect(name.fileName(counter)).toMatch(SHIPPER_NAME_RE);
          });
        }
      }
    }

    it('never lets the shipper see a file being written', () => {
      const hidden = new BackupName('periodic', '0.3.1', at).hiddenName();
      expect(hidden).not.toMatch(SHIPPER_NAME_RE);
      expect(hidden.startsWith('.')).toBe(true);
    });

    it('rejects the shapes the shipper would ignore', () => {
      expect('periodic_20261107T020000Z_0.3.1.db-2').not.toMatch(
        SHIPPER_NAME_RE
      );
      expect('pachanguero-20261107-020000.db').not.toMatch(SHIPPER_NAME_RE);
    });
  });
});
