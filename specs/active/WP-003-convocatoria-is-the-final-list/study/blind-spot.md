# What this Study cannot see (Q-09)

- **The live database holds only the seeded history.** No live game, no convocatoria, no manual edit exists, so every statement about how a game is run comes from code, not use. Payment practice and what "an edit before the game" looks like are asked in interview 2.
- **The history has no convocatorias.** It would hide that "played from the convocatoria" fails for every imported game if only the new flow were looked at (Q-04).
- **Code that is not exercised.** `cancelled` exists in the type and the data but no screen sets it; its intended state machine is a design question, not an observation.
- **The game screen's comfort** (the vision's complaint) cannot be measured from source. The author's description is the only evidence.
