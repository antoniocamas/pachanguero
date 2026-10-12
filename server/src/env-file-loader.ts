import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Fills the environment from a `.env` file before anything reads a setting. The file is the
 * one given with `--env-file <path>` (or `--env-file=<path>`), else the default one, which
 * may be missing. A variable that is already set wins over the file, so a real environment
 * (a container, a service unit) is never overridden. A file named on purpose must exist.
 */
export class EnvFileLoader {
  constructor(
    private readonly env: NodeJS.ProcessEnv,
    private readonly defaultPath: string
  ) {}

  /** Loads the file and returns the arguments without the `--env-file` option. */
  apply(argv: string[]): string[] {
    const rest: string[] = [];
    let named: string | undefined;
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === '--env-file') {
        named = argv[++i];
        if (!named) throw new Error('--env-file necesita una ruta');
      } else if (arg.startsWith('--env-file=')) {
        named = arg.slice('--env-file='.length);
      } else {
        rest.push(arg);
      }
    }
    this.load(named === undefined ? this.defaultPath : resolve(named), named);
    return rest;
  }

  private load(path: string, named: string | undefined): void {
    if (!existsSync(path)) {
      if (named !== undefined) throw new Error(`No existe el fichero ${path}`);
      return;
    }
    for (const [key, value] of Object.entries(
      parseEnv(readFileSync(path, 'utf8'))
    )) {
      this.env[key] ??= value;
    }
  }
}
