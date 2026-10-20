# Rehearsal on a copy of production

A one-time check with real data: every payment since 2026-09-01 is put back as a debt on a copy
of the production database, the real Revolut account is read, and what the system settles is
compared with what the organiser recorded by hand.

The tool writes real names and amounts. Everything it makes lives beside the copy, outside the
repository (`~/pachanguero-rehearsal/`), and is never committed. Only counts go into
`RETROSPECTIVE.md`.

## The tool

```bash
npx tsx specs/active/WP-006-bizum-payment-detection/rehearsal/rehearsal.ts reset  --db <copy> --from 2026-09-01
npx tsx specs/active/WP-006-bizum-payment-detection/rehearsal/rehearsal.ts report --db <copy>
```

- `reset` refuses unless `--db` names an existing file outside the repository and not already
  reset. It opens the copy the way the server does (a backup in `PACHANGUERO_BACKUPS`, default
  `<copy folder>/backups`, then the migration, and prints the schema version), writes
  `ground-truth.json`, puts each payment paid on or after `--from` back as a debt, and writes the
  `rehearsal_marker` table. A copy already at the latest schema version makes no backup.
- `report` refuses without the marker. It writes `report.md` and prints the counts: **agreed**,
  **disagreed** (a wrong payment: another payer or amount), **extra** (automatic, none recorded
  by hand), **open** (paid by hand, no Bizum settled it), the waiting Bizums by reason, the entries
  by outcome and the pairings made.
- A discarded entry keeps only its key, so discards can be counted by outcome, not by rule.

Check the tool first on a copy of the local database made with `PACHANGUERO_DB=<folder>/copy.db
npm run seed`: `reset` then `report` with no bank read lists every ground-truth share as open and
nothing else.

## Procedure

1. Fetch the latest daily backup into `~/pachanguero-rehearsal/` through the
   `pachanguero-deployment-management` skill (read-only on production).
2. `reset --db ~/pachanguero-rehearsal/<file>.db --from 2026-09-01`. Note the migration line.
3. Start the app built for production on the copy: `PACHANGUERO_DB` the copy,
   `PACHANGUERO_BACKUPS=~/pachanguero-rehearsal/backups`,
   `PACHANGUERO_PUBLIC_URL=http://localhost:8787`, and the production Enable Banking id and key
   in the local `.env`.
4. In the production application of the Enable Banking Control Panel, add
   `http://localhost:8787/api/bank/callback` as an allowed redirect URL. If it is refused, stop:
   the author decides.
5. Ajustes › Banco: connect on a desktop browser, approve in the Revolut app, choose the EUR
   account, set the start date to 2026-09-01, press "Leer ahora".
6. In Deudas go through "Bizums en espera": pair senders, noting each pairing; rule or dismiss only
   where the organiser really would.
7. `report`, and read `report.md` with the organiser.
8. "Desconectar", then remove the `localhost` redirect URL from the Control Panel.

**Passes when** the report has no disagreed payment, every extra one is explained, every waiting
Bizum has a reason the organiser understands, and the migration ran without error.
