import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Two rules about where code may look:
 * - the Bizum core knows nothing of the application: it imports only itself, Node built-ins and,
 *   in its SQLite stores, `better-sqlite3`;
 * - only the bank adapters name a particular bank.
 */

const IMPORT_SPECIFIER = new RegExp(
  [
    `\\bimport\\s+(?:[^'"()]*?\\sfrom\\s+)?['"]([^'"]+)['"]`,
    `\\bexport\\s+[^'"()]*?\\sfrom\\s+['"]([^'"]+)['"]`,
    `\\bimport\\(\\s*['"]([^'"]+)['"]\\s*\\)`,
  ].join('|'),
  'g'
);

/** One source file: where it is, its text, and what it imports. */
class SourceFile {
  constructor(
    readonly path: string,
    readonly text: string
  ) {}

  specifiers(): string[] {
    return [...this.text.matchAll(IMPORT_SPECIFIER)].map(
      match => match[1] ?? match[2] ?? match[3]
    );
  }

  lineMentioning(pattern: RegExp): number | null {
    const index = this.text.split('\n').findIndex(line => pattern.test(line));
    return index < 0 ? null : index + 1;
  }
}

/** The repository's sources, found from this file. */
class Sources {
  private readonly serverSrc = dirname(fileURLToPath(import.meta.url));
  private readonly repoRoot = resolve(this.serverSrc, '../..');

  serverPath(...parts: string[]): string {
    return join(this.serverSrc, ...parts);
  }

  under(directory: string, extensions: readonly string[]): SourceFile[] {
    return this.walk(directory)
      .filter(path => extensions.some(extension => path.endsWith(extension)))
      .map(path => new SourceFile(path, readFileSync(path, 'utf8')));
  }

  everythingThatMayNameABank(): SourceFile[] {
    return [
      ...this.under(this.serverSrc, ['.ts']),
      ...this.under(join(this.repoRoot, 'web/src'), ['.ts', '.tsx']),
      ...this.under(this.serverPath('db'), ['.sql']),
    ];
  }

  display(path: string): string {
    return relative(this.repoRoot, path).split(sep).join('/');
  }

  private walk(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory()
        ? this.walk(join(directory, entry.name))
        : [join(directory, entry.name)]
    );
  }
}

/** Why a file under the core may not import a specifier, or null when it may. */
class CoreImportRule {
  constructor(
    private readonly coreDir: string,
    private readonly storesDir: string
  ) {}

  violation(file: SourceFile, specifier: string): string | null {
    if (specifier.startsWith('node:')) return null;
    if (specifier.startsWith('.')) {
      const target = resolve(dirname(file.path), specifier);
      return target.startsWith(this.coreDir + sep)
        ? null
        : 'leaves the Bizum core';
    }
    if (specifier === 'better-sqlite3') {
      return file.path.startsWith(this.storesDir + sep)
        ? null
        : 'is the database, allowed only under bizum/sqlite/';
    }
    if (specifier === 'vitest') {
      return file.path.endsWith('.test.ts')
        ? null
        : 'is the test runner, allowed only in tests';
    }
    return 'is a package the core may not use';
  }
}

describe('the Bizum core', () => {
  const sources = new Sources();
  const coreDir = sources.serverPath('bizum');
  const rule = new CoreImportRule(coreDir, join(coreDir, 'sqlite'));

  it('imports only itself, Node built-ins, and the database in its stores', () => {
    const offences = sources
      .under(coreDir, ['.ts'])
      .flatMap(file =>
        file.specifiers().map(specifier => ({
          file,
          specifier,
          why: rule.violation(file, specifier),
        }))
      )
      .filter(found => found.why !== null)
      .map(
        found =>
          `${sources.display(found.file.path)} imports '${found.specifier}', which ${found.why}`
      );

    expect(offences).toEqual([]);
  });

  describe('the rule itself', () => {
    const file = (relativePath: string) =>
      new SourceFile(join(coreDir, relativePath), '');

    it.each([
      ['feed.ts', './model.js', null],
      ['feed.ts', 'node:crypto', null],
      ['feed.ts', '../domain/clock.js', 'leaves the Bizum core'],
      ['feed.ts', '../bank/revolut-dialect.js', 'leaves the Bizum core'],
      ['feed.ts', 'better-sqlite3', 'allowed only under bizum/sqlite/'],
      ['sqlite/store.ts', 'better-sqlite3', null],
      ['sqlite/store.ts', '../model.js', null],
      ['feed.ts', 'express', 'a package'],
      ['feed.ts', 'vitest', 'allowed only in tests'],
      ['feed.test.ts', 'vitest', null],
    ])('%s importing %s', (path, specifier, why) => {
      const found = rule.violation(file(path), specifier);
      if (why === null) expect(found).toBeNull();
      else expect(found).toContain(why);
    });
  });

  it('finds every form of import', () => {
    const text = [
      "import { a } from './a.js';",
      "import type { B } from '../b.js';",
      "import './side-effect.js';",
      "export { c } from './c.js';",
      "const d = await import('./d.js');",
      "import Database from 'better-sqlite3';",
    ].join('\n');

    expect(new SourceFile('x.ts', text).specifiers()).toEqual([
      './a.js',
      '../b.js',
      './side-effect.js',
      './c.js',
      './d.js',
      'better-sqlite3',
    ]);
  });
});

describe('the bank adapters', () => {
  const sources = new Sources();
  const adapters = sources.serverPath('bank') + sep;
  const thisTest = fileURLToPath(import.meta.url);

  it('are the only code that names Revolut', () => {
    const offences = sources
      .everythingThatMayNameABank()
      .filter(file => !file.path.startsWith(adapters) && file.path !== thisTest)
      .flatMap(file => {
        const line = file.lineMentioning(/revolut/i);
        return line === null ? [] : [`${sources.display(file.path)}:${line}`];
      });

    expect(offences).toEqual([]);
  });
});
