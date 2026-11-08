CODENAME: DC-GAME-LIFECYCLE-312

# Game lifecycle constraints

State table: `docs/domain-model/ciclo-del-partido.md`.

- Only `GameLifecycle` says which moves are legal among `open`, `convocatoria_created`, `convocatoria_confirmed`, `played`, `cancelled`. A state changes only through `GameLifecycleService.perform` (or `GameRepository.setState` inside it).
- Cancelling remembers the state it left in `cancelled_from`; undoing returns there.
- What a state lets you edit is a capability (`edit_apuntados`, `edit_convocatoria`, `pay`, `teams`) the services check; never check the state itself.
- Write `signed_up` and `guest_candidates` only from `CandidateResolutionService`, on save only.
- Make `ConvocatoriaService` store the selection and write **no** exclusion rows, nor `played` or payment.
- Write `played` and exclusion rows only from `PlayedOutcomeEffect` (run when a game enters or leaves `played`), derived by `PlayedDerivation`, so a point is retracted on reopen or cancel and restored on playing again.
- Make `TeamPasteService` record only `team`.
