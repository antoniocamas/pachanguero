# Frontend Coding Standard

**Mandatory reading before any design or coding work on `web/src`** — referenced from `AGENTS.md`.
Companion to [`coding-standard.md`](coding-standard.md), which governs `server/src` instead: that
standard is OOP/SOLID-with-classes; this one is functional, because React's hooks cannot be called
from a class component at all (`coding-standard.md` §Scope). "Functional" is not "undisciplined" —
this document is SOLID's five pressures translated into function-and-hook terms, not an exemption
from them.

## Scope

Applies to `web/src/**`.

## Paradigm: function components and hooks, composed — not one component doing everything

A component or hook is a unit exactly like a class is in the backend standard: it earns its
existence by having one job. The failure mode this standard exists to prevent already exists in
this codebase — `web/src/pages/GameDay.tsx` (324 lines) fetches game data, computes money
(`perHead`, `owed`, `euros`), derives a convocatoria outcome, and renders four different card
sections, all in one component with no extraction. That is not "the hooks style being messy," it is
the absence of this standard.

### 1. One responsibility per component, per hook, per function

- **SRP.** A component renders; it does not also own the fetch, the money math, and the mutation
  logic inline in its body. Split each concern out:
  - **Data access** → a custom hook (`useGameDetail(gameId)`, wrapping `api.game` +
    `useState`/`useEffect`), never `fetch`/`api.*` called directly inside a rendering component's
    body beyond that hook.
  - **Pure calculation** → a plain function in a `lib/` module (`lib/money.ts`: `euros`, `perHead`,
    `amountOwed`), not inlined in JSX or in a component's function body. These are exactly as pure
    as `server/src/domain/`'s functions — being on the frontend doesn't change that discipline, only
    the fact that they stay functions here instead of becoming class methods.
  - **Rendering** → the component itself, as close to `data in, JSX out` as the screen allows.
- A component or hook that does two of the three above is split, the same way a backend class
  mixing persistence and business rules is split under `coding-standard.md`.

### 2. Composition over branching (Open/Closed, functionally)

- New behavior is a new component, a new hook, or a prop/render-prop that changes what's composed —
  not a new `if`/ternary branch added inside an existing component that already has several.
- Example forward-looking case from WP-001: the candidate-vs-final paste views (UC-001-03,
  UC-001-06) share a resolution UI (link/register/alias). That shared piece is one component taking
  props/callbacks, used by both screens — not one component with a `mode: 'candidate' | 'final'`
  prop branching its whole render tree.

### 3. Prop and hook-argument shape (Interface Segregation)

- A component takes the narrow slice of data/callbacks it actually uses, not a whole domain object
  "in case." `GameDay.tsx`'s own `{ season, players, games, onGamesChanged }` props are already
  reasonably shaped this way — keep new components to that standard, not a `{ app }` god-prop.
- A custom hook returns the narrow shape its callers need (data + the specific actions), not the
  raw fetch response plus every intermediate flag.

### 4. Depend on the seam, not the concrete call (Dependency Inversion, functionally)

- Components depend on `api.ts`'s typed functions (already the project's seam — `web/src/api.ts`),
  never on `fetch` directly. This is already the convention; this standard makes it load-bearing,
  not incidental.
- A component under test/story should be able to take its data/callbacks as props or a hook return
  value it can substitute — not reach into a module-level singleton itself.

### 5. Substitutability (Liskov, functionally)

- Two components used interchangeably in the same slot (e.g. both `GameDay`/`Standings`/`Manage` as
  `App.tsx`'s tab content) must accept a compatible prop shape and carry no hidden extra
  precondition one has and the others don't.

## What this changes about the existing codebase

- `GameDay.tsx` is split: a `useGameDetail`/`useConvocatoria`-style data hook, a `lib/money.ts` for
  `euros`/`perHead`/`owed`, and smaller rendering components per card (`GameHeader`, `PlayerList`,
  `ConvocatoriaList` — the last already separated out).
- `App.tsx`'s inline `prompt()`-driven season-creation flow and `Manage.tsx`'s inline mutation
  callbacks stay as-is in shape (they're already reasonably single-purpose) but any new growth
  there follows §1–§5 rather than accreting into the existing functions.
- No component is rewritten as a class; hooks remain hooks.

## Enforcement

`eslint-plugin-react-hooks` and `eslint-plugin-react-refresh` are already installed
(`package.json`) and run under `npm run lint` — they catch hook-rule violations (deps, conditional
hooks) but not this standard's composition/SRP rules, which have no off-the-shelf lint rule. Until
one exists, this is enforced by design and code review, per `AGENTS.md`'s existing rule that no
check may be downgraded or skipped without asking first.
