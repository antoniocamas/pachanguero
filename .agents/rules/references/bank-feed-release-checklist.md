# Guided checklist for a release that touches the bank feed

For what the suites cannot do: they need a person signed in to the aggregator's control panel (CAPTCHA, e-mail and SMS codes). Use the sandbox application with the Mock bank, never the production account, from a browser on `localhost`.

1. **Fresh consent.** In the Banco panel press "Conectar con Revolut", approve in the Mock's consent page. Expect the return to the app and "Conectado hasta …" about 179 days ahead.
2. **An entry added after a read.** Press "Leer ahora", add a Bizum-shaped entry to the Mock data in the control panel, press "Leer ahora" again once the five-minute gap between reads has passed. Expect the new entry kept (a payment or in "Bizums en espera") and nothing already known repeated.
3. **A pending entry becoming booked.** Add a pending entry, read, confirm it is not kept; book it, read again. Expect it kept once.
4. Throughout, expect the server log to hold codes and counts only: no token, key or session id.
