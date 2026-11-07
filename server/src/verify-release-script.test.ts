import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../scripts/verify-release.sh'
);

/** What the pretend cluster answers; each field is the stub's answer to one kubectl question. */
interface Cluster {
  ready: string;
  images: string;
  versionEnv: string;
  status: string;
  appLog: string;
  backupLog: string;
}

const HEALTHY: Cluster = {
  ready: 'pachanguero=true\nbackup=true',
  images:
    'registry.local:5000/pachanguero:0.4.0\nregistry.local:5000/pachanguero:0.4.0',
  versionEnv: '0.4.0',
  status: '200',
  appLog: 'Pachanguero listening on :8787',
  backupLog: '',
};

/** A `kubectl` on the PATH that answers from environment variables, so no cluster is needed. */
class StubKubectl {
  readonly dir = mkdtempSync(join(tmpdir(), 'verify-release-'));

  constructor() {
    const file = join(this.dir, 'kubectl');
    writeFileSync(
      file,
      `#!/bin/bash
all="$*"
case "$all" in
  *containerStatuses*) printf '%s\\n' "$STUB_READY" ;;
  *"containers[*]"*) printf '%s\\n' "$STUB_IMAGES" ;;
  *printenv*) printf '%s\\n' "$STUB_VERSION_ENV" ;;
  *" node -e "*) printf '%s\\n' "$STUB_STATUS" ;;
  *"-c backup"*) printf '%s\\n' "$STUB_BACKUP_LOG" ;;
  *logs*) printf '%s\\n' "$STUB_APP_LOG" ;;
  *) exit 1 ;;
esac
`
    );
    chmodSync(file, 0o755);
  }

  run(cluster: Cluster, args: string[]) {
    return spawnSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: {
        PATH: `${this.dir}:${process.env.PATH}`,
        STUB_READY: cluster.ready,
        STUB_IMAGES: cluster.images,
        STUB_VERSION_ENV: cluster.versionEnv,
        STUB_STATUS: cluster.status,
        STUB_APP_LOG: cluster.appLog,
        STUB_BACKUP_LOG: cluster.backupLog,
      },
    });
  }

  remove(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

describe('scripts/verify-release.sh deployed', () => {
  let stub: StubKubectl;
  beforeEach(() => {
    stub = new StubKubectl();
  });
  afterEach(() => stub.remove());

  const deployed = (cluster: Cluster, version = '0.4.0') =>
    stub.run(cluster, ['deployed', '--version', version]);

  it('passes on a healthy pod and says the public address is left to the operator', () => {
    const result = deployed(HEALTHY);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('deployed checks passed: 0.4.0');
    expect(result.stdout).toContain('NOT VERIFIED: the public address');
  });

  it('fails and names the check when a container is not ready', () => {
    const result = deployed({
      ...HEALTHY,
      ready: 'pachanguero=true\nbackup=false',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FAIL containers ready');
  });

  it('fails and names the check when the pod runs another version', () => {
    const result = deployed(HEALTHY, '0.4.1');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FAIL image version');
  });

  it('fails when the running version in the environment is not the released one', () => {
    const result = deployed({ ...HEALTHY, versionEnv: '0.3.0' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FAIL running version');
  });

  it('fails when the app does not answer 200', () => {
    const result = deployed({ ...HEALTHY, status: '500' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FAIL request');
  });

  it.each([
    ['the app', { appLog: 'Error: SQLITE_BUSY' }],
    ['the backup sidecar', { backupLog: 'backup failed' }],
  ])('fails when the log of %s has an error', (_who, change) => {
    const result = deployed({ ...HEALTHY, ...change });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FAIL logs');
  });

  it('asks for a version in the form X.Y.Z', () => {
    const result = stub.run(HEALTHY, ['deployed', '--version', 'latest']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('deployed needs --version X.Y.Z');
  });
});
