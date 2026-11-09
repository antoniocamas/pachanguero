CODENAME: SD-BACKUP-AND-RESTORE-339

# Backup and restore

The database is a single SQLite file, but **copying it with `cp` while the
application runs is not a safe backup**: SQLite keeps recent writes in a separate
file (`pachanguero.db-wal`) and only folds them into the main file later. A copy
of the main file alone can lose those writes. That is why the application ships its own backup command.

## Two kinds of backup

Every backup is one file named `<kind>_<UTC time>_<version>.db`, for example
`periodic_20261107T020000Z_0.3.1.db`. The time is UTC whatever the machine's zone; the version is the
running one (`PACHANGUERO_VERSION`, which the chart sets from the image tag), or `unreleased` when it
is not set.

| Kind         | When it is made                                                                                                                                                    | Name                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| **periodic** | When the operator runs `pachanguero-admin backup`, and on erebor every Tuesday at 08:15 Madrid time (the `backup` sidecar)                                         | `periodic_<UTC>_<version>.db` |
| **release**  | Before a release is deployed (`pachanguero-admin backup --kind release --version <new version>`), and automatically when a new release starts on an older database | `release_<UTC>_<version>.db`  |

These names are the contract with the backup shipper: a file with any other name is never shipped, and nothing says so.

If the automatic backup before a schema change cannot be written, the server **does not migrate and
does not start**: the database is left as it was.

The backup is taken while the server keeps running; it asks for no user or password. It prints the
path of the file it wrote:

```bash
# with Node (development, or on the service machine)
npm run admin --workspace=server -- backup

# in a container
docker exec <container> pachanguero-admin backup [--kind periodic|release] [--version <version>]
# ✓ /backups/periodic_20261107T020000Z_0.3.1.db
```

`--kind` defaults to `periodic`; `--version` overrides `PACHANGUERO_VERSION`.

If it cannot be created (the disk is full, say), the command prints
`✗ No se pudo crear la copia: …`, exits with an error, leaves no partial file
behind and does not change the live database.

## Where the backups are

In the folder named by `PACHANGUERO_BACKUPS`. When it is not set, that is
`backups/` next to the database file (`PACHANGUERO_DB`).

- **The application never deletes them**, and never overwrites one. On erebor the folder is the
  staging folder of the backup shipper ([`deployment.md`](deployment.md#data-and-backups)), which trims it
  once the copy is on `papiros`. Anywhere else, clearing out old ones is up to the operator.
- **Each backup holds the users with their password hashes, the contact
  data and the bank connection** (the session the app reads the account with, and the Bizums
  read from it), so it is created readable by its owner only (mode `0600`), and the folder is
  created with mode `0700` when the application makes it (on erebor the operator makes it). Treat it like the database: never put it anywhere public.
- A backup file is a complete database. Any SQLite client can open it.

### Off erebor: the copy on papiros

The shipper (`trade4me-server`) runs every day at 09:00 Madrid time. It encrypts each staged file and pushes it to `NetBackup/erebor/pachanguero/<name>.enc` on `papiros`. `papiros` is up from 08:00 to 01:00 Madrid time: a backup made while it is off waits in staging and goes out at the next run. Do anything that needs `papiros` (a drill, a fetch, an on-demand shipper job) between 08:00 and 01:00. The shipper, the server and the account are in `home-network-map` (`services/backup-shipper`, `services/rsync-papiros`).

### In a container

Mount `/data` (the database) and `/backups` **separately**: the backups can then be read, copied or stored away from the container without touching the live database, and they survive the container or the data volume being deleted.

The container process is the `node` user (uid 1000). If you mount host folders instead of named volumes, that user must be able to write to them (`chown 1000:1000`).

## Restoring a backup

If the copy you need is only on `papiros`, [fetch it first](#fetching-a-copy-from-papiros).

Restoring is a manual operation and is done **with the application stopped**; the
application has no restore command. Afterwards the application shows the data as
it was when the backup was made, users included; whatever happened after that is
lost.

1. **Stop the application.**
2. **Keep the current database** in case you get it wrong: copy
   `pachanguero.db` _and_ `pachanguero.db-wal` and `pachanguero.db-shm` if they
   exist, or take a manual backup first if it still starts.
3. **Replace the database file with the chosen backup** and **delete
   `pachanguero.db-wal` and `pachanguero.db-shm`**: they belong to the old file
   and, if left, SQLite would apply them on top of the restored one.
4. **The owner must be the application's user,** and it must be able to write.
5. **Start the application** and check that you can log in and that the players
   and games are the ones you expect. If the backup comes from an older schema
   version, starting migrates it.

To **rehearse** a restore without risk, do it on a copy: start another instance
with `PACHANGUERO_DB` pointing at a temporary file holding the backup, on another
port.

## Fetching a copy from papiros

Needed when the staging folder on erebor is gone, or to prove a copy is readable. Run it on any
machine with `rsync` and `openssl`, in a scratch folder with
`umask 077`.

1. List what there is: `rsync rsync://netbackup@<papiros>/NetBackup/erebor/pachanguero/` (the rsync
   password of the `netbackup` account is asked for; `<papiros>`'s address is in `home-network-map`).
2. Fetch one: `rsync rsync://netbackup@<papiros>/NetBackup/erebor/pachanguero/<name>.enc .`
3. Decrypt it: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <name>.enc -out <name>`;
   `openssl` asks for the passphrase.
4. Check it: start a throwaway instance on it (`PACHANGUERO_DB=<name>`, another port; an older schema is
   migrated and writes its own `release_…` copy beside it) and see the players and the latest game.
   The container has no `sqlite3`; if you have one, `PRAGMA integrity_check` must answer `ok`.
5. Restore it as [above](#restoring-a-backup), and delete the scratch folder.

**What it takes to read a copy** is the encryption passphrase, shared by every application the shipper
serves, and the `netbackup` rsync password. Both are in the operator's password manager; the
passphrase is also `backupShipper.passphrase` in the git-ignored `k8s/values.secrets.yaml` of
`trade4me-server`. Without the passphrase no copy on `papiros` can be read: keep it safe, and never
paste it into a chat, a log or a document.

The shipper's own `list` and `fetch` jobs do the same inside the cluster
(`docs/deployment/recovery.md` in `trade4me-server`).
