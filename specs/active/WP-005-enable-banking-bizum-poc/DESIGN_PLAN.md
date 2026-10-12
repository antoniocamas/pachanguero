# Design — WP-005-enable-banking-bizum-poc

**Depth: shallow.** The code is throwaway and cheap to rewrite; what is at stake is the quality of the findings, which come from running it. Budget: about two pages.

Artifact types: **Code** (one Python script, procedural, no class standard applies outside `server/src`) and **System documentation** (the two guides).

## 1. Current Implementation

Nothing exists for this in the repository (`grep -ri bizum` over `docs`, `server/src`, `web/src` and the README found nothing; `verified — invocation`). The environment already has Python 3.14.4 with `pyjwt` and `requests` importable, plus `cryptography` and OpenSSL (`study/pachanguero-today.md`, Q-09; `verified — invocation`), so nothing needs installing. Players and aliases live in the SQLite `players` and `player_aliases` tables (`server/src/db/schema.sql`); `NameMatcher` matches by case- and accent-insensitive equality after `NameStripper` (`server/src/domain/`), `verified — source` (Q-11). The PoC reads those tables and changes nothing.

## 2. High Level Design

### 2.1 Architecture

Units, then components:

| Component | Units (all under this work package) |
| --- | --- |
| **PoC script** | `poc/ebpoc.py` (commands), `poc/README.md` |
| **Local state** | `poc/local/` — `<app-id>.pem`, `config.json`, `session.json`, `transactions.jsonl`, `reports/` (git-ignored) |
| **Guides** | `output/enable-banking-revolut-integration.md`, `output/pachanguero-integration.md` |

### 2.2 Approach

One Python file with one subcommand per step (`aspsps`, `auth`, `session`, `fetch`, `inspect`, `recognise`, `match`, `limits`, `status`, `close`), each reading and writing plain JSON files in `poc/local/`. It is run by hand against the real account, and what it prints becomes the findings that are written into the two guides. Created: all units. Modified: none (the `.gitignore` entry already exists).

Justification: the Vision asks for knowledge, not a service, so there is no scheduler, database or abstraction layer. One file is fastest to change while the real payloads teach us what matters. Sacrificed: structure and tests of a production design, which the follow-up work package owns. No decision here is hard to reverse, so no alternatives are recorded.

Decisions: (1) **Python**, since `pyjwt` and `requests` are present (`verified — invocation`). (2) **Redirect capture by pasting the redirected URL** into `session`, so it works whether or not the registered `redirect_url` is reachable; the application is registered with an HTTPS redirect URL (e.g. `https://example.com/callback`; nothing has to listen there), so the first authorisation does not depend on E-04; a `localhost` URL is tried afterwards as the E-04 experiment and its outcome recorded (`author decision`). (3) **JWT** with `exp = iat + 3600` as in the Quick start (`verified — document`, Q-01). (4) **Dedup key** (`identification_hash`, `entry_reference`), skipping `PDNG` (`verified — document`, Q-08). (5) **Player names** are read through Python's `sqlite3` in read-only mode and matched with a port of the `NameMatcher` rule (strip, then `casefold` plus accent folding); the port is `inferred` to match the TypeScript's `localeCompare(..., 'es', {sensitivity:'base'})`.

[Flow diagram](design/diagrams/flow.puml)

### 2.3 Impacted Units (Component level)

| Unit | Type | Location | Action | Notes |
| --- | --- | --- | --- | --- |
| `ebpoc.py` | script | `poc/` | Create | all commands |
| `README.md` | doc | `poc/` | Create | how to run, per command |
| `local/*` | data | `poc/local/` | Create (ignored) | key, session, raw data |
| two guides | doc | `output/` | Create | the deliverables |

### 2.4 Interface Specification

Command line only; each subcommand prints a human-readable report and exits non-zero on an API error, printing the `error` code. Files: `config.json` `{app_id, key_path, redirect_url, aspsp:{name,country}}`; `session.json` `{session_id, valid_until, accounts:[{uid, identification_hash}]}`; `transactions.jsonl` one raw transaction per line plus `_hash` and `_fetched_at`. Shapes follow the API reference (`study/enable-banking-docs.md`); `not yet run`.

### 2.5 Unit Communication

See the diagram: the script calls the API with a fresh JWT per call, and communicates with the other commands only through the files in `poc/local/`.

### 2.6 Refactors

None: pure new functionality.

### 2.7 New Functionality

| # | Feature | Component | Units | Scenarios | Status | Verification | Mandatory Reading |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | Config, signing, API client, local store, error reporting | PoC script, Local state | `ebpoc.py` (core) | UC-005-03-S1, UC-005-03-S2 | terminal | `git status` clean after a run | `study/enable-banking-docs.md` |
| F2 | Authorise: `aspsps`, `auth`, `session`, `status`, `close` | PoC script | `ebpoc.py` | UC-005-01-S1–S4, UC-005-07-S1, UC-005-07-S2 | terminal | real run | `study/enable-banking-docs.md` |
| F3 | Fetch and store: `fetch` (paging, dedup, pending, accounts by hash) | PoC script | `ebpoc.py` | UC-005-02-S1–S3, UC-005-07-S3 | terminal | second fetch adds nothing | `study/enable-banking-docs.md` |
| F4 | Bizum inspection and recognition: `inspect`, `recognise` | PoC script | `ebpoc.py` | UC-005-04-S1–S3 | deferred — R1, resolved by the output of `inspect` on real Bizums (the marker rule cannot be written before) | lists the known Bizums | `study/poc-experiments.md` |
| F5 | Player match report: `match` | PoC script | `ebpoc.py` | UC-005-05-S1, UC-005-05-S2 | terminal | database file unchanged | `study/pachanguero-today.md` |
| F6 | Limit probe: `limits` | PoC script | `ebpoc.py` | UC-005-06-S1–S3 | terminal | prints counts and dates | `study/enable-banking-docs.md` |
| F7 | The two guides | Guides | `output/*.md` | UC-005-08-S1, UC-005-09-S1 | deferred — R1, resolved by the results of running F1–F6 | each `unknown` answered or "not determined" | `study/poc-experiments.md` |

### 2.8 Documentation Impact

None: the PoC changes no shipped document (`AGENTS.md`, `docs/`), per the doc map (Q-13). The production work package will extend them.

### 2.9 Risks

- Revolut may not expose the sender or a Bizum marker: UC-005-04-S2 states the negative result, which is still a finding.
- A rate limit locks us out for hours: `limits` runs last, once, and the earlier commands are used sparingly (`limits` is the only one that probes on purpose).
- Raw personal data leaves `poc/local/`: only anonymised shapes go to the guides (UC-005-03).
- Authorisation consent lasts at most 180 days (`verified — document`, Q-07); the PoC does not renew automatically.

### 2.10 Test Methodology

Verification is by running against the real account (see `docs/test-strategy.md`: unit, route and E2E layers do not apply to throwaway code outside the app). One tiny `selfcheck` command runs dedup and the Bizum rule on synthetic, anonymised fixtures.

| # | Element | Fully automatable? | Manual verification needed |
| --- | --- | --- | --- |
| F1 | Core | Partly | `git status` after a run |
| F2 | Authorise | No | approve in the Revolut app; session stored |
| F3 | Fetch | Partly (dedup via `selfcheck`) | second real fetch adds zero |
| F4 | Recognise | Partly | listed Bizums equal the ones the organiser knows |
| F5 | Match | Yes (fixtures) | read the report against the real names |
| F6 | Limits | No | observe count and recovery time |
| F7 | Guides | No | read |

### 2.11 Patterns and Conventions

Procedural script, one function per command, files as the only shared state; stdlib plus `pyjwt` and `requests`. No pattern catalogue.

## 3. Low Level Design

Not needed beyond the tables above: each element is a subcommand of one file whose behaviour is fully given by its scenarios, and F4 and F7 cannot be designed further before the PoC runs. Per element, the Data Contract (2.4), Impacted Units (`poc/ebpoc.py`) and Test Methodology (2.10) are stated once above rather than repeated.

## 4. Documentation Impact

None (see 2.8).

## Detector results

- **D1 grounding:** every claim above cites a study answer, a command output or is tagged; the one `inferred` is the Python port of the name rule.
- **D2 assumption register:** unanswered study items (Q-04 redirect URL, all of Q-05 Bizum fields) are the PoC's own experiments; no element rests on them except F4, which is deferred.
- **D3 reachability:** every command is named and every scenario has an element; nothing reads "figure out X".
- **D4 pre-mortem:** discovery that would make a command wrong: Revolut requiring PSU headers (F2/F3 would need them; the script reads `required_psu_headers` from `aspsps`), and Bizums indistinguishable (F4 reports it).

**Deferrals: 2** — R1 ×2 (F4, F7).
