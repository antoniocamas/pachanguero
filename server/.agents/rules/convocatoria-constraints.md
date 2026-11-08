CODENAME: DC-CONVOCATORIA-320

# Convocatoria constraints

Specification: `docs/domain-model/convocatoria.md`.

- Store a convocatoria when it is created and stamp it when confirmed: keep `rules_json` plus every entry with the points it saw and the outcome the selection chose, so past selections stay auditable after late payments change current standings. Confirming only stamps `confirmed_at`.
- Recreating a convocatoria recomputes it; ask before discarding hand corrections.
- Hand corrections (`ConvocatoriaEditService`) change only an entry's `playing`; never its `outcome`, points or position.
