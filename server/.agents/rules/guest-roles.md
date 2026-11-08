CODENAME: DC-GUEST-ROLES-327

# Fijo and invitado

Definitions: `docs/domain-model/glossary.md#fijo-e-invitado`.

- Never leave a guest without a host.
- Keep every rule in `SeasonRolePolicy` and `GuestClassifier`.
- Write `season_roles` only from a saved list's first placement (`GuestRoleService.recordSaved`) or by the organiser's hand (merging players aside).
- A change of role or usual hosts re-saves every unplayed list.
- In the convocatoria, fijos always come before guests.
