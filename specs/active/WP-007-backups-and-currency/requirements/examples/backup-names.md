# Backup names

The shipper's accepted pattern (`NAME_RE` in the shipper's `push-backups.sh`):

```
^(release|periodic)_[0-9]{8}T[0-9]{6}Z_[A-Za-z0-9.+-]+\.[a-z0-9.]+$
```

Each name below was run through that pattern with `grep -E` on 2026-11-07 (the command's real
answer: `ships` or `ignored`). Whether pachanguero produces the name is `not yet run`: the code does
not exist yet; the names are worked by hand from UC-007-01.

| name | made by | the shipper |
|---|---|---|
| `periodic_20261107T020000Z_0.3.1.db` | the daily run, or `pachanguero-admin backup`, on 0.3.1 | ships |
| `release_20261107T093015Z_0.4.0.db` | the migration at the start of 0.4.0, or the step before its deploy | ships |
| `periodic_20261107T020000Z_unreleased.db` | a backup with no version in the environment | ships |
| `periodic_20261107T020000Z_0.3.1-2.db` | a second backup in the same second (UC-007-01-S3) | ships |
| `periodic_20261107T020000Z_0.3.1.db-2` | a wrongly placed counter | ignored, never shipped |
| `pachanguero-20261107-020000.db` | today's names | ignored |
| `pachanguero-20261107-020000-before-migration.db` | today's names | ignored |
| `.periodic_20261107T020000Z_0.3.1.db.part` | the file while it is being written | ignored |
| `periodic_20261107T020000Z_latest.db` | a deploy of `latest` | ships, which is why UC-007-01-S7 refuses it |

The version reaches the application as the environment variable `PACHANGUERO_VERSION` (set by the
chart from the image tag or the chart's `appVersion`); unset, the name carries `unreleased`
(`study/decisions.md`).
