CODENAME: DC-BIZUM-314

# Bizum constraints

- Write a Bizum payment only through `BizumSettlementService` and `ShareSettler`, in the transaction of the entry that was read, with `method = 'bizum'`, `bizum_id` (the kept Bizum) and the date the money was booked. A manual payment has `bizum_id` null.
- Identify a sender only by a stored Bizum name (`player_bizum_names`: how they appear on Bizum, not a sign-up alias; a player may have several) or phone. Name, aliases and any similarity only _suggest_; a name held by two players identifies nobody. Pairing adds the name (never replacing the others) or writes the phone.
- The rules pay only games on or before the booking date. Later games, and the debts of earlier seasons (only with money the Bizum's own season leaves), are paid only by the organiser's ruling.
- Judge a waiting Bizum again only after a pairing, a played game, a share moved to another holder or the organiser's ruling, always in `review` mode (never discards), oldest booking first.
- The organiser's ruling may pay other players' own shares from the sender's Bizum (`BizumResolutionService.rule(..., others)`, `ShareSettler`'s `onBehalf`): the share keeps its holder; the payment records the sender as payer.
