# Q-09 — Blind spot

This Study read schema, domain code, docs, and frontend call sites, but never queried the live
`data/pachanguero.db` contents (only the 2024/2025 seed CSVs, via `import-season.ts`'s logic, not
the data itself). It cannot say whether real historical data already contains edge cases the schema
doesn't cleanly model today — e.g., whether any past game already needed an ad-hoc guest, a
same-day drop-out, or a name collision the current unique-name constraint would have blocked. If
Requirements needs concrete historical examples (e.g., to validate the WhatsApp-paste format against
something real, or to size how often occasional players actually occur), that's a follow-up query
against the live DB or against the author's own WhatsApp history, not something this Study covers.
