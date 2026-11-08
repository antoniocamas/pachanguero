CODENAME: DC-BIZUM-BANK-BOUNDARY-330

# Bizum and bank boundary

- Import nothing outside `src/bizum/` from it but Node built-ins (and `better-sqlite3` under `src/bizum/sqlite/`); `architecture-boundaries.test.ts` enforces it.
- Name a bank or an aggregator only in `src/bank/`.
