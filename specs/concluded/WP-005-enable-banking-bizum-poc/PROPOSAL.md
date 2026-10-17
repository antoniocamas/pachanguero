# Enable Banking Bizum Poc

Most players pay by Bizum into the organiser's Revolut account, and the organiser reconciles each payment into Pachanguero by hand.
Build a throwaway proof of concept that reads the incoming Bizums from Revolut through the Enable Banking API (authorise once, poll transactions, inspect how a Bizum shows up in the payload).
Tells us, before any production design, whether automatic payment detection is feasible at all: what Revolut exposes, how reliably a sender can be identified, and what the rate limits and consent expiry cost.