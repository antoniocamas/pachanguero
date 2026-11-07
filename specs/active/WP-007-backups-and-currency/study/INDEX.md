# Study index — WP-007-backups-and-currency

| Q | Question | Lens | Raised | Status | Closed | Signal | Answer |
|---|----------|------|--------|--------|--------|--------|--------|
| Q-01 | Which code, scripts, docs and skills write, read, list or prune backup files, and what does each do when names and location change? | Reachability | 0 | closed | 0 | expected | [backups-in-pachanguero.md](backups-in-pachanguero.md) |
| Q-02 | How does the shipper behave with our files (name pattern, extension, `.` names, when it trims, papiros off) and what does the `apps:` change plus redeploy in `trade4me-server` involve? | Runtime | 0 | closed | 0 | expected | [shipper-and-restore.md](shipper-and-restore.md) |
| Q-03 | What is the state on erebor today (staging directory, owner, hostPath under k3s)? | Runtime | 0 | closed | 0 | expected | [erebor-state.md](erebor-state.md) |
| Q-04 | What else depends on the `/backups` PVC or mount, and what is the move path for the backups already in it? | Variants | 0 | closed | 0 | expected | [backups-in-pachanguero.md](backups-in-pachanguero.md) |
| Q-05 | How does the version reach the backup name, what version does a before-migration backup carry, and how is the UTC timestamp produced? | Runtime | 0 | closed | 0 | surprising | [backups-in-pachanguero.md](backups-in-pachanguero.md), [decisions.md](decisions.md) |
| Q-06 | What does a restore from papiros look like end to end, and what does the drill consist of? | Reference completeness | 0 | closed | 0 | expected | [shipper-and-restore.md](shipper-and-restore.md) |
| Q-07 | What versioned or pinned things exist in the repo and around it, and where does each live? | Reachability | 0 | closed | 0 | surprising | [currency.md](currency.md) |
| Q-08 | What does `t4m-3pp-update` do beyond our immediate need, and which parts matter for pachanguero? | Reference completeness | 0 | closed | 0 | expected | [currency.md](currency.md) |
| Q-09 | If "update all" ran today, what would move, and which majors would be blocked or break? | Runtime | 0 | closed | 0 | expected | [currency.md](currency.md) |
| Q-10 | What verification exists today, and what is a minimal post-upgrade gate built from it without local k3d? | Reachability | 0 | closed | 0 | expected | [gates-release-docs.md](gates-release-docs.md) |
| Q-11 | How do the release skill and the new 3pp skill hand over (version bump for an upgrade-only release, rebuild on current OS packages, backup-before-release, ordering)? | Variants | 0 | closed | 0 | surprising | [gates-release-docs.md](gates-release-docs.md), [decisions.md](decisions.md) |
| Q-12 | Which documents become untrue (the doc map)? | Governing docs | 0 | closed | 0 | expected | [gates-release-docs.md](gates-release-docs.md) |
| Q-13 | What else do the touched pieces serve (the variant inventory)? | Variants | 0 | closed | 0 | surprising | [backups-in-pachanguero.md](backups-in-pachanguero.md), [shipper-and-restore.md](shipper-and-restore.md) |
| Q-14 | What would this study fail to show? | Blind spot | 0 | closed | 0 | expected | [gates-release-docs.md](gates-release-docs.md) |
