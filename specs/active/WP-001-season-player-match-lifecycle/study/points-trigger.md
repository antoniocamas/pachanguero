# Q-06 — What actually triggers the "1 point for being cut" today

`computePoints` (`domain/points.ts`) sums `attendance` (paid games) + `exclusions` (count of
`exclusions` rows with `kind` in `points`/`demoted`, via `exclusionScores`) + `seniority`. A `mercy`
exclusion scores nothing in this term (mercy means you played, and scores through `attendance`
instead) — this matches the author's "only candidates eliminated by the algorithm are guaranteed
the point" description exactly, and confirms `mercy` is deliberately excluded from
`exclusionScores`.

The trigger today is single-event: `commitConvocatoria` (`repo.ts`) writes the `exclusions` row in
the same transaction it freezes the convocatoria — there is no intermediate "candidate, not yet
decided" state distinct from "decided and excluded." Today's model has exactly two states for a
signed-up player after Monday: excluded-with-a-point (`exclusions` row written) or
playing-provisionally (`participations.played = 1`, set by the same commit). Nothing currently
models the Vision's third state — "candidate, outcome still open until post-game attendance is
recorded" — because `played` is set immediately by the algorithm rather than deferred to a real
post-game step (see [candidate-convocatoria-stages.md](candidate-convocatoria-stages.md)).

This is exactly the point-timing question Vision §3 flags as in scope: which event (algorithmic
cut vs. post-game attendance) triggers a point is already correctly resolved for the _excluded_
side (algorithmic cut → point, immediately, matches the author's rule) but entirely unresolved for
the _played/paid_ side, since `played` today means "the algorithm said so," not "this person
actually turned up and this is now final."
