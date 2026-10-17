# Retrospective — WP-005-enable-banking-bizum-poc

## What Worked

- 2026-10-17: [tools] Reading what the Control Panel page itself calls (the network requests of the Mock ASPSP page) showed in minutes which interface manages the Mock data and how it authenticates, where the public documentation says nothing about it.
- 2026-10-17: [process] Asking the author before each change to their live Control Panel (a transaction added then removed, the redirect URL list changed then restored) kept every experiment reversible, and each was undone and checked afterwards.

## What Didn't Work

- R-001: 2026-10-17: [tools] A batch of sandbox experiments ran against the **production** configuration because the variable that selects the configuration folder was set in an earlier shell call and did not persist; the script gave no sign of which application it used. Cost: a handful of real read-only calls spent on the real Revolut session ahead of the rate-limit probe of another task, which is meant to be the only deliberate probe, and a correction in the README.
- R-002: 2026-10-17: [process] A step that needs a person to pass a protection (the Enable Banking sign-in: CAPTCHA, e-mail code, SMS code, harder with every sign-in) was scripted and tried three times before the author was asked what it costs them. Cost: about half an hour of the author's time on CAPTCHAs, and a saved login that never existed.

## Root Cause Analysis

### R-001: The sandbox run that hit the production configuration

**5 Whys:**

1. Why did the experiments reach production? The variable that selects the configuration folder was not set in that shell, so the script used the production folder.
2. Why was it not set? Each command runs in a fresh shell, and it had been set in an earlier call.
3. Why did the script run anyway? A missing setting silently meant production.
4. Why was that acceptable? The script was written for production first; the sandbox was added as an override whose safety relied on the operator remembering it.
5. Why was it not caught? Nothing said which environment a command was about to use.

**Root Cause:** a tool that can reach both a safe and a costly environment defaulted to the costly one and never said which it was using.

**Solution Type:** Documentation

**Action Items:**

- [x] State the guard where the next builder will read it: the sandbox guide (section 2) and the Pachanguero recommendation (section 3) say the suite names its environment first and refuses to start unless the configuration names the sandbox. Origin R-001; root cause the unsafe default; cost a few real calls on the real session. No change to the throwaway script.

### R-002: Scripting a step that needs a person to pass a protection

**5 Whys:**

1. Why did the author spend half an hour on CAPTCHAs? The "sign in once by hand" step assumed a sign-in is a one-off.
2. Why was that assumed? The earlier guides recorded the consent as a few clicks and never said what the sign-in behind it costs.
3. Why was its cost unknown? The question was written as "can a script drive the page?", a technical question; nobody asked what a person pays each time the protection fires.
4. Why were the provider's terms read last? No use case listed what the terms allow; they were read as part of the limits work, at the end.
5. Why? The planning question for an external system asks what the service can do, not what we may do to it and what each human step costs.

**Root Cause:** the iteration planned its experiments by technical possibility only, and never asked, before scripting, what the provider's terms permit and what each human step costs the person. A lens covers external systems but yields no question about permission or human cost: fix that lens's wording, add no second lens.

**Solution Type:** Process Change

**Action Items:**

- [ ] Ask both questions in the Use Case Audit for any use case that automates a step against an external service (raised as `ACT-006` in the Auctor specs repository). Origin R-002; root cause above; cost about half an hour of the author's time and a late discovery that part of the method conflicted with the terms.

## Action Items Summary

| Id    | Action                                                        | Type          | Status | Where it landed                                                       |
| ----- | ------------------------------------------------------------- | ------------- | ------ | --------------------------------------------------------------------- |
| R-001 | State the environment guard in the guides, not in the script  | Documentation | done   | `output/enable-banking-sandbox-testing.md` §2, `output/pachanguero-sandbox-testing.md` §3 |
| R-002 | Ask what the terms allow and what each human step costs, before automating | Process Change | pending | `ACT-006` in the Auctor specs repository (`actions/`) |
