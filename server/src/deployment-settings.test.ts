import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every environment variable the server reads must be accounted for in production: set by the
 * Dockerfile, passed by the Helm chart, or listed below as deliberately left to the application's
 * own default. A variable that is none of these works locally through `.env` and is silently
 * missing in the cluster.
 */

const NAME = '[A-Z][A-Z0-9_]+';

/** A piece of source text and the environment variable names it reads. */
class SourceText {
  constructor(private readonly text: string) {}

  environmentNames(): Set<string> {
    const dotted = new RegExp(`\\benv\\.(${NAME})\\b`, 'g');
    const indexed = new RegExp(`\\benv\\[\\s*['"](${NAME})['"]\\s*\\]`, 'g');
    return new Set(
      [...this.text.matchAll(dotted), ...this.text.matchAll(indexed)].map(
        match => match[1]
      )
    );
  }

  /** The names set by `ENV` instructions, continuation lines included. */
  dockerEnvNames(): Set<string> {
    const names = new Set<string>();
    let inEnv = false;
    for (const line of this.text.split('\n')) {
      if (/^\s*ENV\s/.test(line)) inEnv = true;
      if (inEnv) {
        for (const match of line.matchAll(new RegExp(`(${NAME})=`, 'g'))) {
          names.add(match[1]);
        }
        inEnv = line.trimEnd().endsWith('\\');
      }
    }
    return names;
  }

  /** The names a chart template sets: `- name: X` entries and top-level `X:` keys. */
  chartNames(): Set<string> {
    const entry = new RegExp(`^\\s*-\\s*name:\\s*(${NAME})\\s*$`, 'gm');
    const key = new RegExp(`^\\s+(${NAME}):`, 'gm');
    return new Set(
      [...this.text.matchAll(entry), ...this.text.matchAll(key)].map(
        match => match[1]
      )
    );
  }
}

/** The repository, read where the deployment is described. */
class Repository {
  private readonly root = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..'
  );

  serverSourceNames(): Set<string> {
    const names = new Set<string>();
    for (const file of this.sourceFiles(join(this.root, 'server', 'src'))) {
      for (const name of new SourceText(
        readFileSync(file, 'utf8')
      ).environmentNames()) {
        names.add(name);
      }
    }
    return names;
  }

  dockerNames(): Set<string> {
    return new SourceText(this.read('Dockerfile')).dockerEnvNames();
  }

  chartNames(): Set<string> {
    const templates = join(
      this.root,
      'deploy',
      'helm',
      'pachanguero',
      'templates'
    );
    const names = new Set<string>();
    for (const file of readdirSync(templates)) {
      for (const name of new SourceText(
        readFileSync(join(templates, file), 'utf8')
      ).chartNames()) {
        names.add(name);
      }
    }
    return names;
  }

  private read(path: string): string {
    return readFileSync(join(this.root, path), 'utf8');
  }

  private sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return this.sourceFiles(path);
      const isSource = entry.name.endsWith('.ts');
      const isTest =
        entry.name.endsWith('.test.ts') || entry.name.includes('test-support');
      return isSource && !isTest ? [path] : [];
    });
  }
}

/** Variables left to the application's own default in production, and why. */
const LEFT_TO_APPLICATION_DEFAULT = new Map<string, string>([
  ['ACCESS_TOKEN_MINUTES', 'default 30; no production need to change it yet'],
  ['REFRESH_TOKEN_DAYS', 'default 30; no production need to change it yet'],
  [
    'COOKIE_SECURE',
    'defaults to true when NODE_ENV=production, which the image sets',
  ],
]);

describe('deployment settings', () => {
  const repository = new Repository();
  const read = repository.serverSourceNames();
  const set = new Set([
    ...repository.dockerNames(),
    ...repository.chartNames(),
  ]);

  it('reads at least the settings known to exist', () => {
    expect(read).toContain('JWT_SECRET');
    expect(read).toContain('PACHANGUERO_DB');
  });

  it('accounts for every variable the server reads', () => {
    const unaccounted = [...read].filter(
      name => !set.has(name) && !LEFT_TO_APPLICATION_DEFAULT.has(name)
    );
    expect(
      unaccounted,
      `Not set by the Dockerfile or the Helm chart, and not listed as left to the application default: ${unaccounted.join(', ')}. ` +
        'Add it to the chart or the Dockerfile (see "Deployment impact of a change" in docs/deployment.md), or list it here with the reason.'
    ).toEqual([]);
  });

  it('keeps the list of application defaults honest', () => {
    const stale = [...LEFT_TO_APPLICATION_DEFAULT.keys()].filter(
      name => !read.has(name) || set.has(name)
    );
    expect(
      stale,
      `Listed as left to the application default but no longer read, or now set by the Dockerfile or chart: ${stale.join(', ')}. Remove them from the list.`
    ).toEqual([]);
  });
});

describe('SourceText', () => {
  it('finds names read as env.X or env["X"]', () => {
    const source = new SourceText(
      "const a = env.FIRST; const b = process.env.SECOND ?? env['THIRD']; const c = environment.NOPE; const d = env.lower;"
    );
    expect([...source.environmentNames()].sort()).toEqual([
      'FIRST',
      'SECOND',
      'THIRD',
    ]);
  });

  it('finds Dockerfile names, continuation lines included', () => {
    const source = new SourceText(
      'FROM node\nENV AA=1 \\\n    BB=2 \\\n    CC=3\nRUN echo DD=4\nENV EE=5\n'
    );
    expect([...source.dockerEnvNames()].sort()).toEqual([
      'AA',
      'BB',
      'CC',
      'EE',
    ]);
  });

  it('finds chart names, from env entries and secret keys', () => {
    const source = new SourceText(
      'env:\n- name: FROM_ENV\n  value: x\nstringData:\n  FROM_SECRET: y\ncontainers:\n- name: lower\n'
    );
    expect([...source.chartNames()].sort()).toEqual([
      'FROM_ENV',
      'FROM_SECRET',
    ]);
  });
});
