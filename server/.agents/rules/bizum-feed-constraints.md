CODENAME: DC-BIZUM-FEED-323

# Bizum feed constraints

- Handle every bank entry in one `BizumFeed` transaction: its ledger row (`bizum_entries`, keyed by the bank's own identification, holding no sender, subject or amount), the kept Bizum and what the policy did with it commit together, so a Bizum is processed once.
- Keep nothing of a discarded entry but its key, and never read it again, also through a renewed connection.
