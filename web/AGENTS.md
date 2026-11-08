# web

The React 19 + Vite single-page app, with no router or state library.

- `src/pages/` — the tabs of the admin shell and the player's own view; `src/components/` the pieces; `src/hooks/` the data access and actions behind them; `src/lib/` the pure calculations, with their vitest tests.
- Call the API only through `call()` in `src/api.ts`.

## Rules

- `../.agents/rules/frontend-coding-standard.md` — before any design or coding work on `src/`
- `.agents/rules/drag-library.md` — importing a drag library or touching `MemberDnd.tsx`
