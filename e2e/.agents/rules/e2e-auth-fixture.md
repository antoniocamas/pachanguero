CODENAME: DC-E2E-AUTH-FIXTURE-341

# E2E sign-in

- Import `test` and `expect` from `e2e/tests/auth.fixture.ts`, not from `@playwright/test`; only `login.spec.ts` uses the plain test. Never share a cookie snapshot across contexts: a refresh rotates the cookie, so each test logs in on its own.
