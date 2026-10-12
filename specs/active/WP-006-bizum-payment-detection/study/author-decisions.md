# Author decisions (interview 2)

Answers the material could not give, each closing or refining a question of `INDEX.md`.

| Decision | Closes | Consequence |
| --- | --- | --- |
| **Most Bizums come from players who are in the database**, especially the amounts that are multiples of 4.00. The sender's displayed name is simply not the stored player name. Some Bizums are about the organiser's **private life** and are not football money. | Q-05, Q-10 | A sender-to-player mapping is needed and is expected to be mostly one-off per sender; "no player" is not the normal case for a name. The system must be able to leave non-football Bizums alone (odd amounts such as 800.00 or 187.43 are typically those). The earlier WP-005 reading that half the senders might be non-players is revised: the cause is naming, not membership. |
| **A start date chosen by the organiser:** everything booked before it is ignored (read here as "ignore everything before a date; I choose the date"). | Q-09 | A setting, not a constant; the 2025/26 history (not in the database) and any earlier Bizum are never touched. Open to correction: if "from a date onwards" meant the opposite (ignore everything *after*), say so. |
| **Unmatched or uncertain Bizums wait in a list the organiser resolves at will;** resolving one by assigning it to a player also teaches that sender for next time. No notification. | Q-04, Q-05, Q-08 | The list is the place where the mapping is created; it is also the correction surface for a wrong automatic payment. Nothing uncertain is settled (never wrong). |
| **When a player has several open debts, a Bizum pays the debt of the nearest game first** (read here as the most recent played game on or before the Bizum's booking date, then further back for further shares). | Q-04 | Differs from the existing debts ordering (oldest first, `DebtRepository.outstandingFor`), so a new ordering is needed for this use. The exact definition of "nearest" (before or after the booking date, ties) is for the requirements. |
| **Deployment is undecided** (Docker Compose or Kubernetes). | Q-06 | The design must hold under both: one process, an in-process poller, secrets from the environment. |
