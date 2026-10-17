# Testing the Bizum feed of Pachanguero against the Enable Banking sandbox

A recommendation for the production work package that reads Bizums for Pachanguero. It applies `enable-banking-sandbox-testing.md` (the verdicts and their evidence) to the three kinds of tests Pachanguero already has (`docs/test-strategy.md`: unit, route integration, end to end) and to the manual live check. Tags: **[PoC]** observed, **[inferred]** reasoned from observations, **[not determined]**.

## 1. The recommendation in one table

| Scenario the feature must handle | Where it is tested | Why (the verdict it rests on) |
| --- | --- | --- |
| The rules and the Revolut dialect on anonymised entries | **fakes**, every commit | no bank is involved; the Mock's entries match the real payload for the recognition fields, so the fixtures can be shared **[PoC]** |
| First read from the start date; the once-only ledger | **sandbox, standing session**, nightly or on request | `date_from` and `entry_reference` behave as on the real bank; a session lasts up to 179 days, so reads need no person **[PoC]** |
| A read of many Bizums (paging) | **sandbox, standing session** with a fixture of more than 100 entries | the Mock pages at 100 and gives a `continuation_key` **[PoC]**; the fixture is uploaded once by hand |
| A read that fails (bad account, bad date, bad key) | **sandbox, standing session** | error codes are produced with the key alone **[PoC]** |
| A new Bizum arrives between two reads (the forced read) | **guided sandbox check** before a release | adding an entry needs a signed-in Control Panel browser **[PoC]** |
| A pending Bizum later booked | **guided sandbox check** | same reason; delete the `PDNG` entry, add the same reference as `BOOK` **[PoC]** |
| The consent, the callback route and "Conectado hasta …" | **guided sandbox check** with a `localhost` redirect | the Mock bank page needs a signed-in user; the local listener receives `state` and `code` **[PoC]** |
| The session expiring (the banner, the warning) | **guided sandbox check** with a consent of a few minutes | `EXPIRED_SESSION` is produced after the validity passes **[PoC]**; each such consent needs a sign-in |
| The session ended early (`CLOSED_SESSION`) | **guided sandbox check** (one) | the call ends a standing session; a person must authorise again **[PoC]** |
| Revoked from the bank side | **fakes** only | the Mock cannot produce it **[not determined]** |
| A rate-limit answer | **fakes**; the real limit is measured on the real account (live check) | the sandbox's behaviour was not measured on purpose **[not determined]** (see 5) |
| What Revolut really sends, approves, limits and expires | the manual live check | no Mock shows it |

The table names, for each scenario, the one tier that can show it against a bank (or the fakes where no bank can). The fakes of tier 1 also cover the logic of every row, with faults and the clock injected.

## 2. The tiers that follow

1. **Fakes, no network, every commit.** The whole of the logic: rules, dialect, once-only ledger, waiting list, re-evaluation, undo, the panel and its E2E against the fake bank server. Faults and the clock are injected here.
2. **Sandbox contract suite, regression-grade** (`npm run test:sandbox`, opt-in). It reads through the real connector and dialect from a **standing session** that a person authorised once and that lasts up to 179 days: reads of the standing fixture, paging, the ledger across two reads, the start date, the failing reads. It starts from a known state **because nobody changes the data**; the suite lists the account first and refuses to run if the count differs from the one it expects. It cannot create a consent or change data, so it can run without a person until the session ends **[inferred]**.
3. **Guided sandbox check, before a release.** A person at the keyboard, signed in to the Control Panel: a fresh consent through the real callback route on a `localhost` redirect, one entry added after a read, the pending-to-booked change, one short consent that expires. It needs a person for each consent and each data change, and it is written as a checklist, not a suite **[inferred]**.
4. **The live check on the real account**, as before: read-only, rarely.

## 3. Practical choices

- **The key.** The sandbox application has its own id and key, separate from the production one, and neither goes into the repository. The standing-session test needs the sandbox key and the stored session; these belong in the environment of the machine that runs tier 2, not in the repository **[inferred]**. Where that machine may be: a CI runner is not forbidden for reads with the key (see 5).
- **The redirect URLs.** Register the `localhost` URL of the real callback route exactly (scheme, port, path), next to a placeholder `https` one; the match is exact **[PoC]**.
- **The test catalogue entry.** A test-only entry mapping `Mock ASPSP` to the Revolut dialect is **honest for the fields the recognition uses**: the Mock returns the same 24 keys as the real Revolut payload and the recognition fields match in presence, type and wording **[PoC]**. It says nothing about Revolut's limits, session lifetime or approval. The entry must exist only in the test composition, never in the production catalogue **[inferred]**.
- **Guard against the wrong environment.** The sandbox suite must refuse to start unless its configuration names the sandbox application and the Mock. A test that ran against the production configuration spends real calls on the real account **[PoC]**.
- **The fixture.** The standing fixture is the 21-entry synthetic one plus enough synthetic entries for more than 100; uploaded once by hand (the upload is behind a CAPTCHA that must not be bypassed) and never edited by the suite. It holds only invented names and numbers.
- **When it runs.** Tier 1 on every commit. Tier 2 nightly or on request: how often it may call the sandbox is **[not determined]**; start with one gentle run a day. Tier 3 before a release that touches the feed.

## 4. What the sandbox cannot give

- Fully unattended consent: every new consent needs a person signed in to the Control Panel, with CAPTCHA and two codes at each sign-in.
- Changes of the Mock data from the suite: only through a signed-in browser.
- Revolut's real behaviour. The live check stays.

## 5. Limits of the sandbox application

The call limit was **not measured**, by the author's decision, to avoid the risk of being blocked; the terms say quotas per second, hour and day may apply without figures **[docs]**. So tier 2 must be designed to be **gentle**: a handful of reads per run, one run per day at most, with no retry loop after a rate-limit answer (stop and report), and it should not be built until that cost is accepted. The terms also forbid driving the Control Panel by automated means, which confirms that consents and data changes stay with a person **[docs]**. The key and the standing session may live on a CI machine for reads with the application's key; nothing forbids it **[inferred]**.

## 6. Decisions left to the production work package

1. Whether tier 2 exists at all, given that it needs a person once per 179 days (to authorise the standing session) and once to upload the fixture. The alternative is guided checks only.
2. Where the standing session and the sandbox key are kept, and who renews the session before it ends.
3. How often tier 2 may run (the limit is not known and was deliberately not measured; see 5).
4. Whether the guided check is a written checklist in the repository or an item of the release procedure.
5. Whether the fake bank server should copy the Mock's page size of 100, the error codes of section 7 of the guide and the exact redirect matching, so that fakes and sandbox disagree as little as possible **[inferred]**.
