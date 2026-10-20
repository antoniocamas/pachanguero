# Backup and restore

The database is a single SQLite file, but **copying it with `cp` while the
application runs is not a safe backup**: SQLite keeps recent writes in a separate
file (`pachanguero.db-wal`) and only folds them into the main file later. A copy
of the main file alone can lose those writes. The container also has no `sqlite3`
tool. That is why the application ships its own backup command.

## Two kinds of backup

| Backup                     | When it is made                                                                          | Name                                              |
| -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **By hand**                | When the operator runs `pachanguero-admin backup`: before something risky, or any time   | `pachanguero-YYYYMMDD-HHMMSS.db`                  |
| **Before a schema change** | Automatically, when a new release that changes the structure starts on an older database | `pachanguero-YYYYMMDD-HHMMSS-before-migration.db` |

If the automatic backup cannot be written, the server **does not migrate and does
not start**: the database is left as it was.

The manual backup is taken while the server keeps running; it asks for no user or
password. It prints the path of the file it wrote:

```bash
# with Node (development, or on the service machine)
npm run admin --workspace=server -- backup

# in a container
docker exec <container> pachanguero-admin backup
# ✓ /backups/pachanguero-20261012-091054.db
```

If it cannot be created (the disk is full, say), the command prints
`✗ No se pudo crear la copia: …`, exits with an error, leaves no partial file
behind and does not change the live database.

## Where the backups are

In the folder named by `PACHANGUERO_BACKUPS`. When it is not set, that is
`backups/` next to the database file (`PACHANGUERO_DB`).

- **The application never deletes them**, and never overwrites one: two backups in
  the same second get `-2`, `-3`… Clearing out old ones is up to the operator. (On erebor the
  `backup` sidecar prunes its daily backups, never the `…-before-migration.db` ones: see
  [`deployment.md`](deployment.md#data-and-backups).)
- **Each backup holds the users with their password hashes, the contact
  data and the bank connection** (the session the app reads the account with, and the Bizums
  read from it), so it is created readable by its owner only (mode `0600`), in a folder
  with mode `0700`. Treat it like the database: never put it anywhere public.
- A backup file is a complete database. Any SQLite client can open it.

### In a container

The image declares two volumes: `/data` (the database) and `/backups` (the
backups). Mount them **separately**: the backups can then be read, copied or
stored away from the container without touching the live database, and they
survive the container or the data volume being deleted.

```bash
docker run -d --init --name pachanguero -p 8787:8787 \
  --env-file .env \
  -v pachanguero-data:/data \
  -v pachanguero-backups:/backups \
  pachanguero
```

(`--init` makes `docker stop` stop the application at once instead of waiting
and killing it.) The same goes for a compose file or Kubernetes: two persistent
volumes, one at `/data` and one at `/backups`. The Kubernetes deployment to
`erebor` is in [`deployment.md`](deployment.md).

The container process is the `node` user (uid 1000). If you mount host folders
instead of named volumes, that user must be able to write to them:
`sudo chown 1000:1000 /path/to/data /path/to/backups`. Backups are created with
mode `0600` and owner uid 1000, so on the host only that user (or `root`) can
read them.

To get a backup out to the host machine:

```bash
docker cp pachanguero:/backups/pachanguero-20261012-091054.db .
```

## Restoring a backup

Restoring is a manual operation and is done **with the application stopped**; the
application has no restore command. Afterwards the application shows the data as
it was when the backup was made, users included; whatever happened after that is
lost.

1. **Stop the application** (`sudo systemctl stop pachanguero`, or
   `docker stop pachanguero`).
2. **Keep the current database** in case you get it wrong: copy
   `pachanguero.db` _and_ `pachanguero.db-wal` and `pachanguero.db-shm` if they
   exist, or take a manual backup first if it still starts.
3. **Replace the database file with the chosen backup** and **delete
   `pachanguero.db-wal` and `pachanguero.db-shm`**: they belong to the old file
   and, if left, SQLite would apply them on top of the restored one.
4. **The owner must be the application's user** (`pi` on the Raspberry Pi, uid
   1000 in the container), and it must be able to write.
5. **Start the application** and check that you can log in and that the players
   and games are the ones you expect. If the backup comes from an older schema
   version, starting makes a `…-before-migration.db` backup and migrates.

On the Raspberry Pi, with the database in `/var/lib/pachanguero`:

```bash
sudo systemctl stop pachanguero
cd /var/lib/pachanguero
sudo rm -f pachanguero.db-wal pachanguero.db-shm
sudo cp backups/pachanguero-20261012-091054.db pachanguero.db
sudo chown pi pachanguero.db
sudo systemctl start pachanguero
```

In a container with named volumes, using a throwaway container to reach the
volumes:

```bash
docker stop pachanguero
docker run --rm -v pachanguero-data:/data -v pachanguero-backups:/backups alpine sh -c '
  rm -f /data/pachanguero.db-wal /data/pachanguero.db-shm &&
  cp /backups/pachanguero-20261012-091054.db /data/pachanguero.db &&
  chown 1000:1000 /data/pachanguero.db'
docker start pachanguero
```

To **rehearse** a restore without risk, do it on a copy: start another instance
with `PACHANGUERO_DB` pointing at a temporary file holding the backup, on another
port.
