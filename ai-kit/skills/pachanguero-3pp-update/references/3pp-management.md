# The 3pp management file

Copied verbatim from the 3pp and release guideline. The only rules for writing `.3pp-management.md`.

## Policy it records deviations from

- Target of every item: the newest patch of the newest LTS line; with no LTS, the newest release.
  Majors included.
- Any other state is a **deviation** and needs an entry. An item behind its target with no entry is
  a defect, reported on every run.

## Kinds of deviation

| Kind           | What it is                                                   | Example                                                         | Ends by                |
| -------------- | ------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------- |
| `hold`         | an item kept below its target                                | `typescript` held at 6.0.3: `typescript-eslint` requires `<6.1` | moving the item        |
| `workaround`   | a change of config, code or host made to cope with a 3pp bug | a host sysctl until containerd ships a fix                      | undoing the change     |
| `accepted-eol` | an item kept at `eol-soon` or `eol` on purpose               | a database major not yet migrated                               | moving or replacing it |

- A built-in skip of a tool (code that never takes majors, a `skip` line of a host upgrade's decide
  step) is a deviation too: each skipped item gets a `hold` entry.
- A workaround applied by hand outside any repo (on a host) is first written as a script in the repo
  that owns that host; the entry points to it.

## File layout

```markdown
# 3pp management

What the lock files and version files cannot show about this repo's third-party versions:
decisions and workarounds. Written only by `pachanguero-3pp-update` (Record mode); read by every
3pp and release skill.

## <item>: <kind>, <decision in a few words>

Since <YYYY-MM-DD>. <reason, in the user's words, never invented>.
Evidence: <upstream issue, PR or release-note links>
Rejected: <alternative> (<why>); ...
Lifts when: `<command>` <result that ends it> | manual: <what to check> <link>
Proof: <test that shows lifting is safe>
Applied: `<command>` <result while it is applied>
Undo: <steps, or the script that undoes it>
```

- `Lifts when` is left out only for a decision that cannot end; the reason says so.
- `Evidence`, `Proof`, `Applied` and `Undo` are required for a `workaround`, optional otherwise.
- Every change to the file goes in the same commit as the change it explains.

## Writing an entry: the decision procedure

Use when an item's target is a choice (a risky major, a blocking peer range, LTS against current),
and as the last branch of a skill's `On failure` when the cause is a 3pp bug.

1. Present the alternatives, each with pros, cons and your recommendation.
2. Wait for the user's choice and reason.
3. Show the entry.
4. Write it.

## Lifting an entry

- `hold`, `accepted-eol`: when `Lifts when` holds, do what the Kinds table's `Ends by` names, through
  the item's own path (a plain move, a decision or an upgrade plan), then delete the entry.
- `workaround`: try `Undo` reversibly first (a live change a reboot or restart reverts), then run
  `Proof`.
  - Pass: undo for good, delete the entry.
  - Fail: restore the workaround, keep the entry, correct `Lifts when` if it was wrong.
