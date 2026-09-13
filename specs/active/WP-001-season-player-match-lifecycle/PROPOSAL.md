# Season Player Match Lifecycle

A new season currently forces re-adding players, but players are a persistent roster that joins/leaves independently of seasons — that model is wrong.
Match creation is a real, multi-step human process (Sunday candidate list -> Monday algorithmic Convocatoria of ~14 via points/mercy rules -> post-game actual Claros/Oscuros attendance that decides payment and points) plus occasional/guest players, a reserve queue, and manual entry for historical games — none of this is modeled.
Design the player/season/match/convocatoria domain model and the WhatsApp-paste input flow (with canonical-name/nickname/emoji matching) so the app matches how games are actually run and recorded.
Getting this right removes the season-boundary friction on the player roster and lets the user record real games, including backfilled historical ones, by pasting the WhatsApp lists they already produce every week instead of manual re-entry.
