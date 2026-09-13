# Specs Repository

## For Agents

Read the Auctor skills before working here:

- `auctor-workflow` — the workflow end to end, and the router to every other skill.
  Start here.
- `auctor-resume` — load an existing work package's state and name the next action.

Never write a work package's artifacts by hand; each one has a skill that owns its format.

The markdown here is a work-package record, not shipped documentation. Do not hold it to the quality
criteria a production repository mandates, and never subject it to a documentation review — it is
settled by the author's approval.

## CLI

Use `wp.py` for work package management:

```bash
python3 wp.py create --name feature-name --importance must  # Create new WP
python3 wp.py list                                          # List active WPs
python3 wp.py rename <id> new-name                          # Rename, keeping the number
python3 wp.py set-status <id> "Vision settled"              # Advance the status
python3 wp.py set-status <id> done                          # Conclude (moves to concluded/)
python3 wp.py cancel <id>                                   # Cancel (moves to concluded/)
python3 wp.py elements <id>                                 # Every element row, status and iteration
python3 wp.py cites <wp-id> <identifier>                    # Where an identifier leads
python3 wp.py cites --all <identifier>                      # Search all WPs
```

`set-status` accepts the seven work-package states. The `auctor-workflow` skill lists them
in workflow order and says what each one means; this file does not restate them.

`rename` keeps the work package's number and the folder it is in, and does not update references to
the old id anywhere else.

`cancel` writes `cancelled` into `metadata.json` and moves the directory. It leaves `PROGRESS.md`
exactly as it was — cancellation is a fact about the work package, not about how far it got — and
`cancelled` is deliberately not one of the seven states `set-status` accepts.

`elements` prints every element row of a work package: the root design's and every iteration
design's, each with its status, the iteration that owns it and the file holding it. It writes
nothing — the inventory is a query, because an index that is maintained is an index that drifts.

`cites <wp-id> <identifier>` resolves an identifier within the named work package and follows its
citations transitively, printing each hop with the file and line that defines it. `<wp-id>` accepts
`WP-042`, `42`, `042`, or the full `WP-042-name`. `--all` searches every work package instead of
scoping to one. **It exits non-zero when any identifier in the closure
resolves nowhere**, and names those: a query that silently drops a citation reports _contained_ when
it is not. Identifier syntax is strict rather than fuzzy — `REQ-nnn`, `REQ-DPL-nnn`, `REQ-OBS-nnn`,
`UC-nnn-nn[-Snn]`, `MT-LEVEL-nn`, `ACT-nnn`, `OI-nn`, `A-nnn`, `D-nnn`, `R-nnn`, `Q-nn`, and the
element ids `Rn` and `Fn` — and anything else is rejected rather than matched loosely.

`list` also reports how many actions in `actions/` are still `open`.

## Structure

- `active/` — work packages not yet concluded
- `concluded/` — work packages whose status is `done` or `cancelled`
- `actions/` — improvements raised by a retrospective that are neither done on the spot nor promoted
  to a work package; only `open` ones stay here
- `actions/closed/` — actions that have left `open` (`done`, `promoted` or `dropped`); the close
  operation moves them here
