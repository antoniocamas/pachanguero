---
name: pachanguero-setup-production-copy
description: Rules for copying, refreshing and querying a local copy of the production pachanguero database (scripts/prod-copy.sh, npm run dev:prod-copy) to try changes against real data. Use when the user wants to test locally with production data, refresh the copy, or copy the production database.
---

# Pachanguero production copy

Options, the sign-in password and what the copy contains: `scripts/prod-copy.sh --help`. The copy lives in `data/prod-copy/`, whose own `.env` is created once and kept; run it with `npm run dev:prod-copy`.
Cluster rules (context, namespace, go-ahead for mutations): the `pachanguero-deployment-management` skill.

## Rules

- Never read, print or `cat` a secret: `data/prod-copy/.env`, the repository's `.env`,
  `values.secrets.yaml`, `~/.kube/*`.
- Never read the copy's personal data into the conversation (contacts, Bizum names, phones). Query
  only what the task needs, as counts or ids where possible.
- Never restore the copy, or anything derived from it, to production.
- Never commit anything under `data/prod-copy/` (git-ignored; keep it so).
- `--fresh` writes a `periodic_<UTC>_<version>.db` backup file in the production pod's `/backups`, the staging folder that is shipped off erebor and that the app never deletes: ask the user before passing it.
- `--keep-bank` only when the user asks for it.
- To start again from production, refresh with `scripts/prod-copy.sh`.
