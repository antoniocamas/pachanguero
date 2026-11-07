import { relative, resolve, sep } from 'node:path';

/**
 * Refuses to scrub any database but one inside the production copy's folder
 * (`data/prod-copy/`), so a wrong `PACHANGUERO_DB` can never reset the passwords of a real one.
 */
export class ProductionCopyGuard {
  private readonly folder: string;

  constructor(folder: string) {
    this.folder = resolve(folder);
  }

  /** Throws unless `dbPath` lies inside the folder. */
  check(dbPath: string): void {
    const rel = relative(this.folder, resolve(dbPath));
    if (rel === '' || rel.startsWith('..') || rel.startsWith(sep)) {
      throw new Error(
        `La base de datos ${dbPath} no está en ${this.folder}: no se modifica`
      );
    }
  }
}
