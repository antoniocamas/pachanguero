/** The two kinds of backup the shipper takes: the scheduled one, and the one made around a release. */
export const BACKUP_KINDS = ['periodic', 'release'] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

/** What a backup of a version that is not known is called. */
export const UNRELEASED = 'unreleased';

/**
 * The name of one backup file: `<kind>_<UTC time>_<version>[-<n>].db`, the only names the
 * backup shipper accepts (`^(release|periodic)_[0-9]{8}T[0-9]{6}Z_[A-Za-z0-9.+-]+\.[a-z0-9.]+$`).
 * The time is UTC whatever the process's time zone. A second backup in the same second
 * carries its counter inside the version part, before the extension, because the shipper
 * ignores a name that ends after the extension. While a file is being written it has the
 * hidden name, and only the rename publishes the final one.
 */
export class BackupName {
  private static readonly VERSION = /^[A-Za-z0-9.+-]+$/;

  private readonly version: string;

  constructor(
    private readonly kind: BackupKind,
    version: string | undefined,
    private readonly at: Date
  ) {
    this.version =
      version === undefined || version === '' ? UNRELEASED : version;
    if (!BackupName.VERSION.test(this.version)) {
      throw new Error(
        `La versión «${this.version}» no sirve para el nombre de una copia: solo letras, cifras, «.», «+» y «-»`
      );
    }
  }

  /** The final name; the counter is left out for the first backup of the second. */
  fileName(counter = 1): string {
    const suffix = counter > 1 ? `-${counter}` : '';
    return `${this.kind}_${this.stamp()}_${this.version}${suffix}.db`;
  }

  /** The name the file has while it is written: it starts with a dot, so the shipper never sees it. */
  hiddenName(counter = 1): string {
    return `.${this.fileName(counter)}.part`;
  }

  private stamp(): string {
    return this.at
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z')
      .replaceAll('-', '')
      .replaceAll(':', '');
  }
}
