# Testing against the Enable Banking sandbox (Mock ASPSP): what can be repeated and what cannot

A guide for anyone who wants to test an application that reads bank data through Enable Banking against the **Sandbox** environment and its **Mock ASPSP** (a fake bank whose accounts you fill). It continues `enable-banking-control-panel-and-testing.md` (registration, the Mock and a first manual test) and answers one question: **can a sandbox test be a regression test, meaning repeatable, unattended and from a known state?** Written from experiments run in October 2026. Claims are tagged **[PoC]** (observed), **[docs]** (stated by Enable Banking) or **[not determined]**.

## 1. The answers at a glance

| Question | Verdict | In one line |
| --- | --- | --- |
| Can the consent be completed by a script? | **hand only** | the consent page is scriptable; the Mock bank page behind it needs a signed-in Control Panel user (CAPTCHA, e-mail code and SMS code) **[PoC]** |
| Can the Mock data be created, appended and removed by a script? | **hand only** (for the application's key) | the Control Panel page does it through a web API that answers only to a signed-in browser session **[PoC]** |
| Can data be added after authorisation and be read? | **scriptable only with a signed-in browser** | yes: the same session read the new entry **[PoC]** |
| Is a `localhost` redirect accepted? | **scriptable** | yes, if listed exactly in the application and used in `POST /auth` **[PoC]** |
| Is `entry_reference` stable, does `date_from` filter, what order? | **scriptable** | stable across fetches and sessions; filtered inclusively on the Mock's side; newest first **[PoC]** |
| Are the entries shaped like the real bank's? | **scriptable** (as a check) | same 24 keys as the real Revolut payload; the recognition fields match **[PoC]** |
| Which bank name and country does `POST /auth` expect? | **scriptable** | `Mock ASPSP` with `ES`, `DK` or `FI`; `GB` refused **[PoC]** |
| Can the edge cases be produced? | **partly scriptable** | `EXPIRED_SESSION`, `CLOSED_SESSION`, a second page, a pending entry becoming booked and a failing read: yes; `REVOKED_SESSION`: not produced; rate limit: not tried on purpose, see 8 **[PoC]** |
| The sandbox's limits (calls, sessions, retention, CI use) | **not determined** (call limit deliberately not measured) | see 8 |

**What follows for a test design:** a *standing session* removes most of the hand work. A consent costs a person a sign-in, but a session lasts up to 179 days, and reading with it needs only the application's key **[PoC]**. Reads against a fixed fixture can therefore be repeated without a person; anything that needs a new consent or a change of Mock data stays a guided check.

## 2. Setting up a sandbox application and reading from it

1. Register a **Sandbox** application in the Control Panel (name and redirect URLs only), with its own key pair kept apart from the production one. It uses the same API host as production; the application id and key decide which environment answers **[PoC]**.
2. List the redirect URLs you will use, one per line and exactly as they will be sent (see 5).
3. In **Mock ASPSP** upload a fixture (the required fields are in `enable-banking-control-panel-and-testing.md`). A real-shaped synthetic one is `poc/fixtures/mock-aspsp-bizum.json`.
4. `POST /auth` with the Mock (`aspsp: {name: "Mock ASPSP", country: "ES"}`), open the returned URL in a browser where you are **signed in to the Control Panel**, press *Continue authentication*, tick the account and *Authorize*.
5. `POST /sessions` with the `code` returns the session and its accounts; read with `GET /accounts/{uid}/transactions`.

**Always check which configuration a script uses before it calls the API.** Selecting the sandbox by an environment variable that is not set sends the same calls to the production application with the real account **[PoC]** (it happened once in these experiments; nothing was changed, but real calls were spent). A script that reads credentials for both environments should refuse to start unless the configuration names the sandbox.

## 3. The consent and the sign-in (can it be scripted?)

- The consent page on `tilisy-sandbox.enablebanking.com` loads in a headless Chromium driven by Playwright, shows no CAPTCHA or other bot check, and accepts *Continue authentication* **[PoC]**.
- That click leads to the **Mock bank's own page** on `enablebanking.com/cp/mock-aspsp/auth`, which requires a signed-in Control Panel user and otherwise redirects to the sign-in **[PoC]**.
- The sign-in is passwordless: an **e-mail code and an SMS code**, and in a fresh automated browser a **CAPTCHA**, harder with every sign-in; one attempt cost the person about ten minutes of CAPTCHAs **[PoC]**. Three attempts to sign in by hand inside a script-started browser did not complete. Nothing was bypassed.
- In a browser where the person was already signed in, the whole consent took four clicks and no further protection **[PoC]**, and the signed-in state lasted across several consents in the same browser pane.
- Not determined: whether a saved signed-in state would let a headless run pass unattended **[not determined]**; it needs a sign-in the organiser declined to repeat for its cost.

**Verdict: hand only.** Plan for a person (or a browser that a person has signed in) for every new consent.

## 4. Controlling the Mock data

- The Control Panel page `enablebanking.com/cp/mock-aspsp` uses a web API under `/api/v2/cp/mock-aspsp/accounts[/{id}/balances|/transactions]`: `GET` the accounts, balances and transactions, `POST` a transaction (HTTP 201), `DELETE` one (HTTP 200) **[PoC]**. It authenticates with the signed-in **browser session**. The same call with the application's JWT answers **401 `UNAUTHORIZED`** **[PoC]**; no Mock-data endpoint exists on the bank-facing API that was found.
- **Whose data:** the account listed on the consent page is the one uploaded under the signed-in user, which points to data per Control Panel user **[PoC]**. A second user or application was not tried **[not determined]**.
- **Appending after authorisation works:** with a session authorised five days earlier, one entry added through the page was read at the next fetch (22 fetched, 1 new) and gone after its deletion **[PoC]**.
- **Adding many entries:** the page's *Add* form takes one entry per click. A loop of 90 clicks 350 ms apart landed 80; 900 ms apart was reliable for single adds **[PoC]**. Any helper must wait or count.
- The upload of a fixture file is behind an invisible reCAPTCHA that must not be bypassed; it was not retried here.
- A pending entry cannot be turned booked in place from the page: the way is to delete it and add the same `entry_reference` as `BOOK` **[PoC]**.

**Verdict: hand only for the application's key; a person-signed-in browser can do everything.** A known starting state therefore means a fixture uploaded once and left alone, plus checks that list the account before a run.

## 5. Redirect URLs

- A `http://localhost:<port>/...` URL listed in the Sandbox application is accepted at registration and by `POST /auth`; before it was listed, `POST /auth` answered 400 `REDIRECT_URI_NOT_ALLOWED` **[PoC]**. A consent then ended at that address with `state` and `code`, and a listener on the port received the request **[PoC]**. This holds for a Sandbox application only: a production application refuses a `http` redirect URL **[PoC, 2026-10-20]**.
- The match is **exact**: another port, another path, or the same URL with a query string was refused **[PoC]**.
- The list takes several URLs, local and `https` together, one per line; each listed one is accepted by `POST /auth`, an unlisted one is refused **[PoC]**.
- A browser that cannot load the redirect target (a placeholder `https` URL) still shows the address with `code`, but a script cannot read it afterwards; a local listener makes the code available to the test **[PoC]**.

**Verdict: scriptable.** A test that runs a server can use its real callback route with a `localhost` URL registered once.

## 6. How faithful the Mock is

- `entry_reference` is **stable** across fetches and across sessions (21 fetched, 20 known, 0 new in a second session with a new account `uid` and the same `identification_hash`) **[PoC]**.
- `date_from` is applied by the Mock, **inclusive**, and the entries come back **newest first**: 21 entries from 2026-08-01, 12 from 2026-09-10, 2 from 2026-09-20, none from 2026-10-01 **[PoC]**.
- **Shape:** the Mock returns the same 24 keys as Revolut's real payload (null-filled where the fixture gives none). The 412 real Bizums differ from the fixture in ten fields that are all `null` in them; the fields a recognition rule uses match in presence, type and wording **[PoC]**. What the Mock cannot show is Revolut's behaviour outside the payload: limits, session lifetime, approval.
- **Bank name:** `GET /aspsps` with a sandbox application lists the Mock for `ES` and `DK` (not `GB`); `POST /auth` accepted `Mock ASPSP` for `ES`, `DK` and `FI`, and refused `GB` with `WRONG_ASPSP_PROVIDED` **[PoC]**.
- **Page size:** the documentation says batches of 10; the Mock returned 100 per page (101 entries gave a page of 100 with a `continuation_key`, then a page of 1) **[PoC]**.

## 7. The edge cases

| Situation | Produced? | How and what came back **[PoC]** |
| --- | --- | --- |
| expired session | yes | `POST /auth` accepts a validity of 1 minute or more; after it passed, a fetch gave HTTP 401 `EXPIRED_SESSION`. `GET /sessions/{id}` still reported `AUTHORIZED` with the past date (in `access.valid_until`, not at the top of the answer): key on the error code |
| session ended by the user | yes | `DELETE /sessions/{id}` then a fetch gave HTTP 401 `CLOSED_SESSION` (it also ends a standing session: authorise again by hand) |
| revoked from the bank side | no | the Mock offers no way **[not determined]** |
| pending entry that becomes booked | yes | add `PDNG` (not stored), delete it, add the same reference as `BOOK`: stored once at the next read |
| a second page | yes | a fixture of more than 100 entries |
| a failing read | yes | unknown account 404 `ACCOUNT_DOES_NOT_EXIST`; bad date, invalid `continuation_key`, unknown `strategy` 422 `WRONG_REQUEST_PARAMETERS`; `date_from` in the future 422 `DATE_FROM_IN_FUTURE`; `date_to` before `date_from` 422 `WRONG_DATE_INTERVAL` |
| rate limit | not tried | by the author's decision, see 8 |

## 8. Limits of the sandbox application

Measured: **no call or session figure**. By the author's decision (2026-10-17) the burst that would find the call limit was **not run**: the terms of service say quotas per second, hour and day may apply, forbid bypassing rate limits, and let Enable Banking block access, and the sandbox shares one API host with production, so the organiser does not risk being blocked for a number. What is known:

- **Sessions:** at least three sessions of one Sandbox application were authorised at the same time without refusal; the ceiling is **[not determined]**.
- **Quotas:** quotas per second, hour and day *may apply*, no figures are published; the sandbox page gives none either **[docs]**. The call limit is **[not determined]**.
- **Retention:** uploaded Mock data stays until the user removes it; no further period is stated **[docs]**.
- **Automated use:** the terms forbid accessing the **Control Panel or the API through bots or other automated devices** and abusive automation. Scripted consents and scripted changes of Mock data in the Control Panel conflict with that wording; reading with the application's key at a sane rate is not forbidden **[docs]**.
- **A CI machine** may call the API with the key (no rule says otherwise); it must not drive the Control Panel **[docs]**.

## 9. Pitfalls found

- The sign-in is the costly step: do not schedule consents; reuse a standing session.
- Check the environment before every call (2).
- The sandbox and production share one API host: a burst against one is a burst from the same machine and network.
- Changing the Mock's data from a script means driving a signed-in browser; count the entries after.
- The uploaded Mock data stays at Enable Banking until removed: only synthetic data belongs there.
