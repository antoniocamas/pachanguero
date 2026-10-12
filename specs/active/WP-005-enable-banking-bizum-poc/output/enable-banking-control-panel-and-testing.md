# Enable Banking Control Panel, field by field, and how to test

For the developer who registers an application and then tests code against it. The bank-side behaviour is in `enable-banking-revolut-integration.md`. Tags: **[PoC]** done in the proof of concept, **[docs]** stated by Enable Banking's documentation, **[not run]** a recommended procedure not yet executed, **[not determined]**.

## 1. The Control Panel at a glance **[PoC]**

Log in at `enablebanking.com/cp`. The top menu has: **API applications** (register and manage), **ASPSP status** (health of each bank, by country, with 30 days of history **[docs]**), **Data insights** (which fields each bank populates and how often, from Enable Banking's own statistics **[docs]**; useful for knowing which fields to expect before coding), **Mock ASPSP** (a fake bank you fill yourself, section 4), **Billing**, **User profile** (e-mail, name, MFA by SMS or authenticator app).

## 2. Registering an application: what to put in each field

Menu **API applications** → form "Add a new application". Sandbox and production applications cannot be converted into each other **[docs]**, so decide first.

| Step / field | What it is | What to enter (this project) |
| --- | --- | --- |
| 1. Environment | **Sandbox**: for development, activated automatically, connected to a limited set of bank sandboxes and the Mock ASPSP **[docs]**. **Production**: real banks; starts *Inactive* **[PoC]**. | One **Sandbox** application for tests (section 5) and one **Production** application for the real account. Sandbox is preselected, so check the choice. |
| 2. Key handling | *Generate in the browser*: the private key is created in your browser and downloaded as `<application-id>.pem`; it is not transmitted **[docs]**. *Generate outside the browser*: you create the key and paste only the public certificate **[PoC]**. | Outside the browser, so the private key is never in a download folder. |
| Application name | Shown to end users on the consent page **[docs]**. | A name the account owner recognises, e.g. `Pachanguero`. Any name is accepted **[PoC]**. |
| Allowed redirect URLs (one per line) | Where the browser is sent after consent, with `?state=...&code=...`. Only whitelisted URLs are accepted (`REDIRECT_URI_NOT_ALLOWED` otherwise) **[docs]**. | Production PoC: `https://example.com/callback` worked; the page need not load because the address bar holds the code **[PoC]**. A `localhost` URL is **[not determined]**; for a real service use an HTTPS endpoint you control. List every environment's URL (one per line). |
| Application description | Shown to the end user on the consent page ("About <name>") **[PoC]**. Required in production. | One honest sentence, e.g. "Personal, non-commercial: reads my own Revolut account to reconcile Bizum payments". |
| Email for data protection matters | Required in production **[PoC]** (the form refuses to submit without it). | A mailbox you read. |
| Privacy URL, Terms URL | Required in production **[PoC]**. In *restricted mode* these are not checked **[docs]**, and placeholders (`https://example.com/privacy`, `/terms`) were accepted **[PoC]**. A review of them happens only when asking for full (unrestricted) activation **[docs]**. | Placeholders for a personal PoC; real documents if the application ever serves other people. |
| 5. Public certificate (only with "outside the browser") | PEM of a self-signed X.509 certificate for your key; Enable Banking uses it to verify your JWTs **[docs]**. The form shows the commands (4096-bit RSA key; self-signed certificate). | See the commands below. |

Commands (the form's own, with a longer validity that was accepted **[PoC]**):

```bash
openssl genrsa -out private.key 4096
openssl req -new -x509 -days 730 -key private.key -out public.crt -subj "/CN=my-app"
```

Paste the contents of `public.crt`. Keep `private.key` secret and out of git. Whether Enable Banking rejects calls once the certificate's validity has passed is **[not determined]**; diarise the expiry.

After pressing **Register** the application gets a **UUID**; it is the application id used as the JWT `kid` **[PoC]**. A sandbox application is active at once; a production one is *Inactive*.

### Activating a production application

- **Restricted mode (individual use)**: press **Activate by linking accounts**, accept Enable Banking's end-user terms, and authorise your own bank account. The application becomes *Active* and can read **only the linked accounts** **[docs]**, **[PoC]**. This is the route for a personal tool.
- **Full activation ("Request activation")**: for serving other people; involves a manual review of name, description, privacy policy and terms, a contract and KYC **[docs]**. Not needed here.
- Linking does not authorise the API: you still run the authorisation flow **[docs]**.

### Managing it afterwards **[docs]**

The three-dot menu on an application offers: **Requests** (a log of API calls with response code, bank, session id, account id; filterable; the first place to look when debugging), **Statistics** (sessions, accounts, per bank), **Edit** (change the fields above and Save), **Share** (add another registered user by e-mail; they need MFA if you have it) and **Remove**. Rotating or adding certificates is **[not determined]**.

## 3. Values the script needs

`poc/local/config.json`: `app_id` (the UUID), `key_path` (the private key), `redirect_url` (one of the whitelisted ones), `aspsp` (`name`, `country`). The environment variable `EBPOC_LOCAL` points the script at another folder of the same files, so a sandbox and a production configuration can coexist (`EBPOC_LOCAL=poc/local-sandbox python3 poc/ebpoc.py ...`). **[PoC]** for the production folder, **[not run]** for a second one.

## 4. The Mock ASPSP (a fake bank you control)

**Mock ASPSP** in the menu **[PoC]**:

- *Add a new account* by hand: fields `name`, `cash_account_type`, `currency`, `usage`, `bic_fi`, `psu_status`, plus optional ones documented under `AccountResource` in the API reference. Transactions are added to the account afterwards **[docs]**.
- *Upload accounts data*: drop a `.json` file; the data is stored on Enable Banking's systems until you remove it **[PoC]**. The format is `{"accounts": [{"info": {...account...}, "transactions": [...]}]}`, the transaction fields being those of the API's Transaction object **[docs]**. A sample file (`DK-Danske_Bank-synthetic-1.json`) can be downloaded from the page.
- There is a way to export a real account as JSON (the `tilisy.com` demo UI, format JSON, code `FREEEXPORT`) **[docs]**. **Do not use it for this project**: it would send real transaction data, naming other people, to a third party.
- Limits **[docs]**: no payment initiation; the transactions endpoint returns **batches of 10, newest first** (so paging with `continuation_key` is exercised with more than 10 transactions); it is available for all countries and needs no credentials.

A synthetic dataset with Bizum-shaped transactions is in `poc/fixtures/mock-aspsp-bizum.json` (invented senders, a fake phone number; 21 transactions: 18 Bizums, one pending, one non-Bizum top-up, one outgoing; one EUR account with a `balances` list). It exercises the recognition rule, de-duplication (two identical payments the same day), the pending skip, a payment of three shares and one below a share.

Findings from using the Mock ASPSP **[PoC]**:

- The upload **requires a `balances` array on every account** (`body.accounts.0.balances: Field required` otherwise), as well as `info` and `transactions`. A minimal balance is `{"name": ..., "balance_amount": {"currency": ..., "amount": ...}, "balance_type": "CLBD"}`. On success the page answers HTTP 201.
- The upload button is protected by an invisible reCAPTCHA that resolves by itself; do not try to bypass it. If you automate the upload, use the browser.
- Data uploaded is stored at Enable Banking until you remove it, so only synthetic data belongs there.
- The mock bank needs no credentials: its authorisation page lists the accounts you uploaded, you tick them and press Authorize, and it redirects to your redirect URL with `?state=...&code=...`.
- **Contrary to the docs**, the transactions call returned all 21 transactions in **one page** (no `continuation_key`), not batches of 10. Paging is therefore **not** exercised by this dataset; a much larger one might trigger it **[not determined]**. Paging remains tested against the real account only (20 pages).
- Date filtering was not exercised: every transaction is newer than any `date_from` used.

## 5. How to test

Use three layers, cheapest first.

1. **Pure checks, no network.** Recognition, de-duplication keys, name matching and URL parsing are functions over data, tested with anonymised fixtures: `python3 poc/ebpoc.py selfcheck` **[PoC]**. Add a case here whenever a real payload surprises you (anonymised).
2. **Sandbox with the Mock ASPSP, no real bank** **[PoC]**. Procedure, as run:
   1. Register a **Sandbox** application (the form asks only for a name and redirect URLs; there is no description field, and the consent page then says "Application description is not provided"), with its own key pair in a separate folder, e.g. `poc/local-sandbox/` (git-ignored), and a `config.json` with `"aspsp": {"name": "Mock ASPSP", "country": "ES"}`. `GET /aspsps?country=ES` with a sandbox application lists four banks: Banco de Sabadell, BBVA, **Mock ASPSP** and Genome; the mock is listed for every country.
   2. In **Mock ASPSP**, upload `poc/fixtures/mock-aspsp-bizum.json` (see section 4).
   3. `export EBPOC_LOCAL=poc/local-sandbox`, then `auth`. The consent URL is on `tilisy-sandbox.enablebanking.com` (note the host). Open it, press *Continue authentication*, tick the account on the mock bank's page and *Authorize*; copy the redirected address into `session`.
   4. `accounts`, `fetch --from 2026-08-01 --account <uid>`, `recognise`. Results: 21 fetched, **20 stored** (the pending one skipped), **18 Bizums** recognised (16 by name, 2 by phone number).
   5. A second `fetch` stores 0 new (20 known). `close` followed by `fetch` gives **HTTP 401 `CLOSED_SESSION`**, the same as the real Revolut session.
   6. Not run in the sandbox: renewal (a second `auth` + `session`; the real account already covered it) and the player matching (it needs the real players database; do not point it at one in a sandbox folder, since it writes the player names into a local report).
3. **The real account, read-only, rarely.** For what no fake can show: the real wording of a Bizum, history depth, rate limits and renewal with the Revolut app. Always read-only, local data only.

**What the sandbox cannot tell you** **[docs]**: Revolut's real payload, its rate limit, its session lifetime and its approval flow. Bank sandboxes in general can be unstable or unrealistic, and the Mock ASPSP returns what you put in it, so the fixture is only as true as the PoC's findings. Tests of the sandbox layer guard the script's own logic (paging, dedup, errors), not the bank.

**Values to carry** **[PoC]**: the sandbox application's id is separate from the production one; so is its key. Do not copy them between folders.

## 6. Order of work for a new application

1. Sandbox application and the fixture: get the code working without the bank.
2. Production application, linked in restricted mode: one real authorisation and fetch.
3. Put the two sets of ids and keys in two folders; never mix them.
