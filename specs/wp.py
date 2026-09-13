#!/usr/bin/env python3
"""Work Package CLI utility for Auctor."""

import argparse
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path


# Base directory is the parent of this script file
SCRIPT_DIR = Path(__file__).parent
SPECS_DIR = SCRIPT_DIR
ACTIVE_DIR = SPECS_DIR / "active"
CONCLUDED_DIR = SPECS_DIR / "concluded"

VALID_STATUSES = {
    "proposal",
    "Vision settled",
    "Study settled",
    "Requirements settled",
    "Design settled",
    "Anatomy settled",
    "done",
}
# The same seven states in workflow order, for the roadmap's sort and grouping.
STATUS_ORDER = {
    "proposal": 0,
    "Vision settled": 1,
    "Study settled": 2,
    "Requirements settled": 3,
    "Design settled": 4,
    "Anatomy settled": 5,
    "done": 6,
}
VALID_IMPORTANCE = {"must", "should", "could", "wont"}


def check_status_vocabulary():
    """Fail loudly if the two status tables have drifted apart.

    A state added to VALID_STATUSES but not STATUS_ORDER used to sort silently last and
    print no roadmap section at all — a vocabulary change half-applied, invisible until
    a work package reached the missing state and quietly vanished from every view.
    """
    valid, ordered = set(VALID_STATUSES), set(STATUS_ORDER)
    if valid != ordered:
        missing = sorted(ordered - valid)
        extra = sorted(valid - ordered)
        problems = []
        if missing:
            problems.append(f"in STATUS_ORDER but not VALID_STATUSES: {missing}")
        if extra:
            problems.append(f"in VALID_STATUSES but not STATUS_ORDER: {extra}")
        raise SystemExit("wp.py status tables disagree — " + "; ".join(problems))

# Identifier syntax, strict on purpose: an identifier that is not greppable cannot be
# resolved, and matching loosely reports a hit that is not one.
ID_PATTERNS = [
    r"REQ-(?:DPL|OBS)-\d+",
    r"REQ-\d+",
    r"UC-\d+-\d+(?:-S\d+)?",
    r"MT-[A-Z]+-\d+",
    r"ACT-\d+",
    r"OI-\d+",
    r"[ADRQ]-\d+",
    r"[RF]\d+",
]
ID_RE = re.compile(r"\b(" + "|".join(ID_PATTERNS) + r")\b")
ID_EXACT_RE = re.compile(r"^(?:" + "|".join(ID_PATTERNS) + r")$")
VALID_ACTION_STATUSES = {"open", "done", "promoted", "dropped"}

DEFAULT_METADATA = {
    "status": "proposal",
    "importance": "could",
    "priority": 999,
}


def ensure_dirs():
    """Ensure active and concluded directories exist."""
    ACTIVE_DIR.mkdir(parents=True, exist_ok=True)
    CONCLUDED_DIR.mkdir(parents=True, exist_ok=True)


def find_wp_dirs(include_concluded=True):
    """Find all work package directories (WP-XXX-name format).

    Args:
        include_concluded: If False, only return WPs from active/ folder
    """
    ensure_dirs()

    wp_pattern = re.compile(r"^WP-\d{3,}-")
    wps = []

    # Always search active directory
    for d in ACTIVE_DIR.iterdir():
        if d.is_dir() and wp_pattern.match(d.name):
            wps.append(d)

    # Optionally search concluded directory
    if include_concluded:
        for d in CONCLUDED_DIR.iterdir():
            if d.is_dir() and wp_pattern.match(d.name):
                wps.append(d)

    return wps


def find_wp_dir(wp_id):
    """Find a specific WP directory by ID.

    Returns the Path object or None if not found.
    """
    wp_pattern = re.compile(r"^WP-\d{3,}-")

    for base_dir in [ACTIVE_DIR, CONCLUDED_DIR]:
        wp_dir = base_dir / wp_id
        if wp_dir.exists() and wp_dir.is_dir() and wp_pattern.match(wp_id):
            return wp_dir

    return None


def resolve_wp_id(wp_id_partial):
    """Resolve a partial WP ID to the full WP ID.

    Supports:
    - Full ID: "WP-001-name" -> "WP-001-name"
    - Number only: "1" or "001" -> "WP-001-*"
    - Partial ID: "WP-001" -> "WP-001-*"

    Returns the full WP ID or None if not found or ambiguous.
    """
    if not wp_id_partial:
        return None

    # If already a full ID pattern, try direct match
    full_pattern = re.compile(r"^WP-\d{3,}-")
    if full_pattern.match(wp_id_partial):
        if find_wp_dir(wp_id_partial):
            return wp_id_partial
        return None

    # Extract number from various formats
    number_match = re.match(r"^(?:WP-)?(\d+)$", wp_id_partial)
    if not number_match:
        return None

    number = int(number_match.group(1))
    if number < 1:
        return None

    # Look for WP-XXX-name pattern
    target_id = None
    wp_pattern = re.compile(rf"^WP-{number:03d}-")

    for wp_dir in find_wp_dirs(include_concluded=True):
        if wp_pattern.match(wp_dir.name):
            if target_id is not None:
                # Ambiguous - multiple matches
                return None
            target_id = wp_dir.name

    return target_id


def load_metadata(wp_dir):
    """Load metadata from a WP directory."""
    metadata_file = wp_dir / "metadata.json"

    if not metadata_file.exists():
        return None

    try:
        with open(metadata_file, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def save_metadata(wp_dir, metadata):
    """Save metadata to a WP directory."""
    metadata_file = wp_dir / "metadata.json"
    metadata["updated"] = str(date.today())

    with open(metadata_file, "w") as f:
        json.dump(metadata, f, indent=2)


def get_active_wps_sorted():
    """Get all active WPs sorted by priority.

    Returns list of tuples: (wp_id, metadata, wp_dir)
    """
    wps = []
    for wp_dir in find_wp_dirs(include_concluded=False):
        metadata = load_metadata(wp_dir)
        if metadata:
            wps.append((wp_dir.name, metadata, wp_dir))

    # Sort by priority, then by id: find_wp_dirs walks the filesystem in arbitrary order, so a
    # stable sort on priority alone leaves equal priorities in an undefined order.
    wps.sort(key=lambda x: (x[1].get("priority", 999), x[0]))
    return wps


def ensure_unique_priorities():
    """Ensure all active WPs have unique priorities (1, 2, 3...).

    Renumber WPs to eliminate gaps and duplicates.
    Returns the number of WPs renumbered.
    """
    wps = get_active_wps_sorted()

    renumbered = 0
    for new_priority, (wp_id, metadata, wp_dir) in enumerate(wps, start=1):
        old_priority = metadata.get("priority", 999)
        if old_priority != new_priority:
            metadata["priority"] = new_priority
            save_metadata(wp_dir, metadata)
            renumbered += 1

    return renumbered


def get_next_priority():
    """Get the next available priority for a new WP (appends to end)."""
    wps = get_active_wps_sorted()
    if not wps:
        return 1
    return len(wps) + 1


def count_open_actions():
    """Count actions whose status is 'open'.

    Returns a tuple of (open count, names of files whose status could not be read). A missing
    actions/ directory means zero, not an error.
    """
    actions_dir = SPECS_DIR / "actions"
    if not actions_dir.is_dir():
        return 0, []

    status_pattern = re.compile(r"^\**Status:\**[^\S\n]*(\S+)", re.MULTILINE)
    open_count = 0
    unreadable = []

    for action_file in sorted(actions_dir.glob("*.md")):
        try:
            match = status_pattern.search(action_file.read_text())
        except (OSError, UnicodeDecodeError):
            match = None
        if not match or match.group(1) not in VALID_ACTION_STATUSES:
            unreadable.append(action_file.name)
        elif match.group(1) == "open":
            open_count += 1

    return open_count, unreadable


def list_wps(include_concluded=False):
    """List all work packages sorted by priority.

    Args:
        include_concluded: If True, include concluded WPs
    """
    wps = []
    for wp_dir in find_wp_dirs(include_concluded=include_concluded):
        metadata = load_metadata(wp_dir)
        if metadata:
            wps.append((wp_dir.name, metadata, wp_dir.parent.name))

    wps.sort(key=lambda x: (x[1]["priority"], x[0]))

    if not wps:
        print("No work packages found.")
    else:
        folder_header = f"{'Priority':<10} {'Importance':<12} {'Status':<12} {'Folder':<12} {'ID'}"
        print(folder_header)
        print("-" * 80)
        for wp_id, metadata, folder in wps:
            imp = metadata.get("importance", "?")
            status = metadata.get("status", "?")
            prio = metadata.get("priority", 999)
            print(f"{prio:<10} {imp:<12} {status:<12} {folder:<12} {wp_id}")

    open_actions, unreadable = count_open_actions()
    print(f"Open actions: {open_actions}")
    for name in unreadable:
        print(f"  Status unreadable, not counted: {name}")


def roadmap(importance_filter=None):
    """Show roadmap, optionally filtered by importance."""
    wps = []
    for wp_dir in find_wp_dirs(include_concluded=False):  # Only active WPs
        metadata = load_metadata(wp_dir)
        if metadata:
            imp = metadata.get("importance", "")
            if importance_filter is None or imp == importance_filter:
                wps.append((wp_dir.name, metadata))

    # Sort by priority within status grouping. A status outside the vocabulary is reported,
    # not silently sorted — a work package the tables cannot name is a defect to surface.
    unknown = sorted({x[1].get("status", "") for x in wps} - set(STATUS_ORDER))
    if unknown:
        print(f"Unknown status in metadata.json (sorted last): {', '.join(unknown)}")
    wps.sort(key=lambda x: (x[1].get("status", "") not in STATUS_ORDER,
                            STATUS_ORDER.get(x[1].get("status", ""), len(STATUS_ORDER)),
                            x[1].get("priority", 999)))

    if not wps:
        if importance_filter:
            print(f"No work packages found with importance '{importance_filter}'.")
        else:
            print("No work packages found.")
        return

    # Group by status, in workflow order — the sections are the vocabulary, so a state
    # missing here would print no section at all.
    by_status = {}
    for wp_id, metadata in wps:
        status = metadata.get("status", "unknown")
        if status not in by_status:
            by_status[status] = []
        by_status[status].append((wp_id, metadata))

    for status in list(STATUS_ORDER) + unknown:
        if status not in by_status:
            continue
        print(f"\n## {status.title()}")
        for wp_id, metadata in by_status[status]:
            imp = metadata.get("importance", "?")
            prio = metadata.get("priority", 999)
            print(f"  [{imp:^4}] P{prio}: {wp_id}")


def set_status(wp_id, new_status):
    """Set work package status. Moves to concluded/ if status is 'done'."""
    if new_status not in VALID_STATUSES:
        print(f"Invalid status: {new_status}")
        print(f"Valid statuses: {', '.join(sorted(VALID_STATUSES))}")
        return

    # Resolve partial WP ID
    resolved_id = resolve_wp_id(wp_id)
    if not resolved_id:
        print(f"Work package not found: {wp_id}")
        return

    wp_dir = find_wp_dir(resolved_id)
    old_status = None
    metadata = load_metadata(wp_dir)
    if metadata:
        old_status = metadata.get("status")

    metadata = metadata or {**DEFAULT_METADATA, "id": resolved_id}
    metadata["status"] = new_status
    save_metadata(wp_dir, metadata)

    # Move to concluded if status changed to done
    if new_status == "done" and old_status != "done":
        target_dir = CONCLUDED_DIR / resolved_id
        if not target_dir.exists():
            shutil.move(str(wp_dir), str(target_dir))
            print(f"Set {resolved_id} status to 'done' and moved to concluded/")
            # Renumber remaining active WPs to close the gap
            ensure_unique_priorities()
        else:
            print(f"Set {resolved_id} status to 'done'")
    elif new_status != "done" and old_status == "done":
        # Move back to active if status changed from done
        target_dir = ACTIVE_DIR / resolved_id
        if not target_dir.exists():
            shutil.move(str(wp_dir), str(target_dir))
            print(f"Set {resolved_id} status to '{new_status}' and moved to active/")
            # Renumber to ensure uniqueness
            ensure_unique_priorities()
        else:
            print(f"Set {resolved_id} status to '{new_status}'")
    else:
        print(f"Set {resolved_id} status to '{new_status}'")


def set_importance(wp_id, new_importance):
    """Set work package importance (MoSCoW)."""
    if new_importance not in VALID_IMPORTANCE:
        print(f"Invalid importance: {new_importance}")
        print(f"Valid values: {', '.join(sorted(VALID_IMPORTANCE))}")
        return

    resolved_id = resolve_wp_id(wp_id)
    if not resolved_id:
        print(f"Work package not found: {wp_id}")
        return

    wp_dir = find_wp_dir(resolved_id)
    metadata = load_metadata(wp_dir) or {**DEFAULT_METADATA, "id": resolved_id}
    metadata["importance"] = new_importance
    save_metadata(wp_dir, metadata)
    print(f"Set {resolved_id} importance to '{new_importance}'")


def rename_wp(wp_id, new_name):
    """Rename a work package's descriptive tail.

    The number is an identity and is never reassigned, and the WP stays in the folder it is in:
    placement follows status, which this command does not touch.
    """
    if not re.fullmatch(r"[a-z0-9-]+", new_name):
        raise SystemExit("Name must be lowercase with hyphens only (e.g., 'user-auth').")

    resolved_id = resolve_wp_id(wp_id)
    if not resolved_id:
        raise SystemExit(f"Work package not found: {wp_id}")

    wp_dir = find_wp_dir(resolved_id)
    number = re.match(r"^WP-(\d{3,})-", resolved_id).group(1)
    new_id = f"WP-{number}-{new_name}"
    target_dir = wp_dir.parent / new_id

    if target_dir.exists():
        raise SystemExit(f"Already exists: {target_dir}")

    shutil.move(str(wp_dir), str(target_dir))

    metadata = load_metadata(target_dir) or {**DEFAULT_METADATA, "id": resolved_id}
    metadata["id"] = new_id
    save_metadata(target_dir, metadata)

    print(f"Renamed {resolved_id} to {new_id}")
    print(f"  Directory: {target_dir}")
    print(f"  References to {resolved_id} elsewhere are not updated by this command.")


def renumber_wps():
    """Renumber all active WPs to eliminate gaps (e.g., 2,5,8,10 -> 1,2,3,4)."""
    wps_before = get_active_wps_sorted()
    if not wps_before:
        print("No active work packages to renumber.")
        return

    print("Current priorities:")
    for wp_id, metadata, _ in wps_before:
        print(f"  P{metadata['priority']}: {wp_id}")

    renumbered = ensure_unique_priorities()

    print("\nAfter renumbering:")
    wps_after = get_active_wps_sorted()
    for wp_id, metadata, _ in wps_after:
        print(f"  P{metadata['priority']}: {wp_id}")

    print(f"\nRenumbered {renumbered} work package(s).")


def insert_wp(priority_position, wp_id):
    """Insert a WP at a specific priority position (1-indexed), renumbering others.

    Args:
        priority_position: The priority number to assign (1-indexed)
        wp_id: Work package ID (partial or full) to insert
    """
    if priority_position < 1:
        print(f"Invalid position: {priority_position}. Position must be >= 1.")
        return

    resolved_id = resolve_wp_id(wp_id)
    if not resolved_id:
        print(f"Work package not found: {wp_id}")
        return

    wp_dir = find_wp_dir(resolved_id)
    # Only allow inserting active WPs
    if CONCLUDED_DIR in wp_dir.parents:
        print(f"Cannot insert concluded work package. Use set-status to change status first.")
        return

    # Get all active WPs except the target, sorted by priority
    all_wps = get_active_wps_sorted()
    others = [(name, meta, dir) for name, meta, dir in all_wps if name != resolved_id]

    # Validate position against max possible
    max_position = len(others) + 1
    if priority_position > max_position:
        print(f"Invalid position: {priority_position}. Max position is {max_position}.")
        return

    # Set target WP priority to a fractional value to ensure correct sort position
    # Using priority_position - 0.5 ensures it sorts BEFORE others with same priority
    target_meta = load_metadata(wp_dir) or {**DEFAULT_METADATA, "id": resolved_id}
    target_meta["priority"] = priority_position - 0.5
    save_metadata(wp_dir, target_meta)

    # Renumber all WPs to ensure uniqueness
    ensure_unique_priorities()

    print(f"Inserted {resolved_id} at priority {priority_position}")


def remove_wp(wp_id):
    """Remove a WP and renumber remaining."""
    resolved_id = resolve_wp_id(wp_id)
    if not resolved_id:
        print(f"Work package not found: {wp_id}")
        return

    wp_dir = find_wp_dir(resolved_id)
    # Delete the WP directory
    shutil.rmtree(wp_dir)

    # Renumber all active WPs to ensure sequential priorities
    renumbered = ensure_unique_priorities()

    print(f"Removed {resolved_id}, renumbered {renumbered} work package(s)")


def move_wp(wp_id, new_priority):
    """Move a WP to a new priority position (1-indexed), renumbering others.

    Args:
        wp_id: Work package ID (partial or full) to move
        new_priority: The new priority number (1-indexed)
    """
    if new_priority < 1:
        print(f"Invalid position: {new_priority}. Position must be >= 1.")
        return

    resolved_id = resolve_wp_id(wp_id)
    if not resolved_id:
        print(f"Work package not found: {wp_id}")
        return

    wp_dir = find_wp_dir(resolved_id)
    # Only allow moving active WPs
    if CONCLUDED_DIR in wp_dir.parents:
        print(f"Cannot move concluded work package. Use set-status to change status first.")
        return

    metadata = load_metadata(wp_dir)
    if not metadata:
        print(f"No metadata found for {resolved_id}")
        return

    # Get count of active WPs and current position
    all_wps = get_active_wps_sorted()
    max_position = len(all_wps)

    if new_priority > max_position:
        print(f"Invalid position: {new_priority}. Max position is {max_position}.")
        return

    # Find current position (1-indexed)
    current_priority = metadata.get("priority", 999)
    current_position = 1
    for wp_id_i, meta_i, _ in all_wps:
        if wp_id_i == resolved_id:
            break
        current_position += 1

    # Set new priority using fractional value for correct sort position
    # When moving UP (current > new): use new_priority - 0.5 to sort BEFORE items at new_priority
    # When moving DOWN (current < new): use new_priority + 0.5 to sort AFTER items at new_priority
    if current_position > new_priority:
        metadata["priority"] = new_priority - 0.5
    else:
        metadata["priority"] = new_priority + 0.5
    save_metadata(wp_dir, metadata)

    # Renumber all to ensure uniqueness
    ensure_unique_priorities()

    print(f"Moved {resolved_id} to priority {new_priority}")


def get_next_wp_number():
    """Get the next available WP number."""
    max_num = 0
    wp_pattern = re.compile(r"^WP-(\d+)-")
    for dir in find_wp_dirs(include_concluded=True):
        match = wp_pattern.match(dir.name)
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    return max_num + 1


def create_wp(name, importance=None, priority=None, proposal_lines=None, interactive=False):
    """Create a new work package.

    Args:
        name: Short identifier for the WP (e.g., "user-auth")
        importance: MoSCoW importance (must/should/could/wont)
        priority: Numeric priority (1, 2, 3...) - if not specified, appends to end
        proposal_lines: List of 3-5 lines for the proposal (non-interactive mode)
        interactive: If True, prompt user for missing fields
    """
    ensure_dirs()

    if interactive:
        print(f"\n--- Creating new Work Package ---")

        if not name:
            name = input("Short identifier (e.g., 'user-auth'): ").strip()
            if not name:
                print("Name is required.")
                return

        if not re.match(r"^[a-z0-9-]+$", name):
            print("Name must be lowercase with hyphens only (e.g., 'user-auth').")
            return

        if not importance:
            print("\nMoSCoW Importance:")
            print("  must    - Critical, blocking")
            print("  should  - Important, not critical")
            print("  could   - Nice to have")
            print("  wont    - Out of scope")
            importance = input("Importance [must/should/could/wont] (default: could): ").strip().lower()
            if not importance:
                importance = "could"
            if importance not in VALID_IMPORTANCE:
                print(f"Invalid importance: {importance}")
                return

        if priority is None:
            # Show current priorities for context
            current_wps = get_active_wps_sorted()
            if current_wps:
                print("\nCurrent priorities:")
                for wp_id, meta, _ in current_wps:
                    print(f"  P{meta['priority']}: {wp_id}")

            default_prio = get_next_priority()
            prio_input = input(f"Priority (default: {default_prio}, appends to end): ").strip()
            priority = int(prio_input) if prio_input else default_prio

        if not proposal_lines:
            print("\nProposal (3-5 lines describing the work):")
            print("  Line 1: What problem are we solving?")
            print("  Line 2: What is the proposed solution?")
            print("  Line 3+: Why is this valuable?")
            print("Enter empty line to finish:\n")
            proposal_lines = []
            for i in range(1, 6):
                line = input(f"Line {i} (or press Enter to finish): ").strip()
                if not line:
                    break
                proposal_lines.append(line)

            if len(proposal_lines) < 3:
                print("Proposal must have at least 3 lines.")
                return

    if not name:
        print("Name is required in non-interactive mode.")
        return
    if not re.match(r"^[a-z0-9-]+$", name):
        print("Name must be lowercase with hyphens only.")
        return
    if importance and importance not in VALID_IMPORTANCE:
        print(f"Invalid importance: {importance}")
        return

    # Auto-assign priority if not specified (append to end)
    if priority is None:
        priority = get_next_priority()
    elif priority < 1:
        print(f"Invalid priority: {priority}. Priority must be >= 1.")
        return

    wp_number = get_next_wp_number()
    wp_id = f"WP-{wp_number:03d}-{name}"

    wp_dir = ACTIVE_DIR / wp_id
    if wp_dir.exists():
        print(f"Work package already exists: {wp_id}")
        return

    wp_dir.mkdir()

    metadata = {
        "id": wp_id,
        "status": "proposal",
        "importance": importance or "could",
        "priority": priority,
        "created": str(date.today()),
        "updated": str(date.today()),
    }
    save_metadata(wp_dir, metadata)

    if proposal_lines:
        proposal_content = f"# {name.replace('-', ' ').title()}\n\n"
        proposal_content += "\n".join(proposal_lines)
        (wp_dir / "PROPOSAL.md").write_text(proposal_content)

    # Renumber all WPs to ensure unique priorities after insertion
    ensure_unique_priorities()

    print(f"\nCreated {wp_id}")
    print(f"  Directory: {wp_dir}")
    print(f"  Importance: {importance or 'could'}")
    print(f"  Priority: {priority}")
    if proposal_lines:
        print(f"  Proposal: {len(proposal_lines)} lines")


def _iter_markdown(wp_dir):
    """Yield (path, lines) for every markdown file in a work package."""
    for path in sorted(wp_dir.rglob("*.md")):
        try:
            yield path, path.read_text().splitlines()
        except (IOError, UnicodeDecodeError):
            continue


def _definition_blocks(lines, identifier):
    """Yield (line_number, block_lines) where `identifier` is defined.

    A definition is the identifier at the head of a bullet, a table row or a heading.
    The block is that line plus the indented lines continuing it.
    """
    esc = re.escape(identifier)
    heads = [
        rf"^\s*-\s+\*\*{esc}\b",
        rf"^\s*-\s+{esc}[:\s]",
        rf"^\|\s*\*?\*?{esc}\*?\*?\s*\|",
        rf"^#{{1,6}}\s+\*?\*?{esc}\b",
    ]
    head_re = re.compile("|".join(heads))

    for i, line in enumerate(lines):
        if not head_re.match(line):
            continue
        block = [line]
        for follow in lines[i + 1:]:
            if follow.strip() and follow[:1].isspace():
                block.append(follow)
            else:
                break
        yield i + 1, block


def _cited_ids(block, identifier):
    """Every identifier a definition block names, other than its own."""
    found = []
    for line in block:
        for match in ID_RE.finditer(line):
            value = match.group(1)
            if value != identifier and value not in found:
                found.append(value)
    return found


def cites(identifier, wp_id=None, search_all=False):
    """Resolve an identifier's citations transitively. Returns an exit code."""
    if not ID_EXACT_RE.match(identifier):
        print(f"Not an identifier: {identifier}")
        print("Accepted: REQ-nnn, REQ-DPL-nnn, REQ-OBS-nnn, UC-nnn-nn[-Snn], MT-LEVEL-nn,")
        print("          ACT-nnn, OI-nn, A-nnn, D-nnn, R-nnn, Q-nn, and element ids Rn / Fn")
        return 2

    # The work package holding the root identifier scopes the whole query.
    home = None
    if search_all:
        for wp_dir in find_wp_dirs(include_concluded=True):
            if any(True for _ in _resolve(wp_dir, identifier)):
                home = wp_dir
                break
    else:
        resolved = resolve_wp_id(wp_id)
        if resolved is None:
            print(f"Work package not found: {wp_id}")
            return 1
        home = find_wp_dir(resolved)
        if home is None:
            print(f"Work package directory not found: {resolved}")
            return 1
        if not any(True for _ in _resolve(home, identifier)):
            print(f"Unresolved: {identifier} — defined in no work package")
            return 1

    if home is None:
        print(f"Unresolved: {identifier} — defined in no work package")
        return 1

    print(f"{identifier} — in {home.name}")
    seen = [identifier]
    unresolved = []
    queue = [(identifier, 0)]

    while queue:
        current, depth = queue.pop(0)
        sites = list(_resolve(home, current))
        if not sites:
            unresolved.append(current)
            print(f"{'  ' * (depth + 1)}{current} — UNRESOLVED")
            continue
        for path, line_no, block in sites:
            rel = path.relative_to(home)
            print(f"{'  ' * (depth + 1)}{current} — {rel}:{line_no}")
            for cited in _cited_ids(block, current):
                if cited not in seen:
                    seen.append(cited)
                    queue.append((cited, depth + 1))

    if unresolved:
        print(f"\nUnresolved: {', '.join(unresolved)}")
        return 1
    print(f"\nResolved {len(seen)} identifiers, none missing.")
    return 0


def _resolve(wp_dir, identifier):
    """Yield (path, line_number, block) for every definition of an identifier."""
    for path, lines in _iter_markdown(wp_dir):
        for line_no, block in _definition_blocks(lines, identifier):
            yield path, line_no, block


ELEMENT_HEADERS = ("refactor", "feature")


def _element_rows(path):
    """Yield element rows from the tables of one design document."""
    try:
        lines = path.read_text().splitlines()
    except (IOError, UnicodeDecodeError):
        return

    columns = None
    for line in lines:
        if not line.startswith("|"):
            columns = None
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        lowered = [c.lower() for c in cells]

        if columns is None:
            if lowered[:1] == ["#"] and any(h in lowered for h in ELEMENT_HEADERS):
                columns = lowered
            continue
        if all(set(c) <= set("-: ") for c in cells):
            continue
        if not cells or not ID_EXACT_RE.match(cells[0]):
            continue

        row = dict(zip(columns, cells))
        name = next((row[h] for h in ELEMENT_HEADERS if h in row), "")
        yield cells[0], name, row.get("status", "—") or "—"


def _anatomy_owners(wp_dir):
    """Map element identifier to the iteration the anatomy assigns it."""
    anatomy = wp_dir / "ANATOMY.md"
    owners = {}
    if not anatomy.exists():
        return owners

    current = None
    heading_re = re.compile(r"^#{1,6}\s+Iteration\s+(\d+)", re.IGNORECASE)
    for line in anatomy.read_text().splitlines():
        heading = heading_re.match(line)
        if heading:
            current = heading.group(1)
            continue
        if current and "**Elements:**" in line:
            for match in ID_RE.finditer(line.split("**Elements:**", 1)[1]):
                owners.setdefault(match.group(1), current)
    return owners


def elements(wp_id):
    """List every element row of a work package. Reads only; writes nothing."""
    resolved_id = resolve_wp_id(wp_id)
    if not resolved_id:
        print(f"Work package not found: {wp_id}")
        return 1

    wp_dir = find_wp_dir(resolved_id)
    owners = _anatomy_owners(wp_dir)

    sources = []
    if (wp_dir / "DESIGN_PLAN.md").exists():
        sources.append((wp_dir / "DESIGN_PLAN.md", None))
    iterations_dir = wp_dir / "iterations"
    if iterations_dir.is_dir():
        for path in sorted(iterations_dir.glob("*/DESIGN_PLAN.md")):
            sources.append((path, path.parent.name))

    rows = []
    for path, iteration in sources:
        for element_id, name, status in _element_rows(path):
            owner = iteration or owners.get(element_id, "—")
            rows.append((element_id, name, status, owner, str(path.relative_to(wp_dir))))

    if not rows:
        print(f"No element rows found in {resolved_id}")
        return 0

    print(f"{'Id':<6} {'Status':<44} {'Iter':<6} {'File':<34} Element")
    print("-" * 110)
    for element_id, name, status, owner, rel in rows:
        print(f"{element_id:<6} {status:<44} {owner:<6} {rel:<34} {name}")
    print(f"\n{len(rows)} elements.")
    return 0


def cancel_wp(wp_id):
    """Cancel a work package: metadata status only, then move to concluded/."""
    resolved_id = resolve_wp_id(wp_id)
    if not resolved_id:
        print(f"Work package not found: {wp_id}")
        return 1

    wp_dir = find_wp_dir(resolved_id)
    if wp_dir.parent == CONCLUDED_DIR:
        print(f"Already concluded: {resolved_id}")
        return 1

    metadata = load_metadata(wp_dir) or {**DEFAULT_METADATA, "id": resolved_id}
    metadata["status"] = "cancelled"
    save_metadata(wp_dir, metadata)

    target_dir = CONCLUDED_DIR / resolved_id
    CONCLUDED_DIR.mkdir(parents=True, exist_ok=True)
    shutil.move(str(wp_dir), str(target_dir))
    ensure_unique_priorities()
    print(f"Cancelled {resolved_id} and moved to concluded/")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Work Package CLI utility")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # list command
    list_parser = subparsers.add_parser("list", help="List all WPs sorted by priority")
    list_parser.add_argument("--all", "-a", action="store_true",
                           help="Include concluded WPs")

    # roadmap command
    roadmap_parser = subparsers.add_parser("roadmap", help="Show roadmap (sorted by status)")
    roadmap_parser.add_argument("importance", nargs="?", choices=sorted(VALID_IMPORTANCE),
                               help="Filter by MoSCoW importance")

    # set-status command
    status_parser = subparsers.add_parser("set-status", help="Set WP status")
    status_parser.add_argument("wp_id", help="Work package ID (full, partial, or number only: WP-001, 1, 001)")
    status_parser.add_argument("status", choices=sorted(VALID_STATUSES), help="New status")

    # set-importance command
    importance_parser = subparsers.add_parser("set-importance", help="Set WP importance")
    importance_parser.add_argument("wp_id", help="Work package ID (full, partial, or number only: WP-001, 1, 001)")
    importance_parser.add_argument("importance", choices=sorted(VALID_IMPORTANCE),
                                  help="MoSCoW importance")

    # rename command
    rename_parser = subparsers.add_parser("rename", help="Rename a WP, keeping its number")
    rename_parser.add_argument("wp_id", help="Work package ID (full, partial, or number only: WP-001, 1, 001)")
    rename_parser.add_argument("new_name", help="New short identifier (e.g., 'user-auth')")

    # renumber command
    subparsers.add_parser("renumber", help="Renumber active WPs to eliminate gaps")

    # insert command
    insert_parser = subparsers.add_parser("insert", help="Insert WP at priority position (1-indexed)")
    insert_parser.add_argument("priority", type=int, help="Priority position (1-indexed)")
    insert_parser.add_argument("wp_id", help="Work package ID (full, partial, or number only: WP-001, 1, 001)")

    # remove command
    remove_parser = subparsers.add_parser("remove", help="Remove WP and renumber")
    remove_parser.add_argument("wp_id", help="Work package ID (full, partial, or number only: WP-001, 1, 001)")

    # move command
    move_parser = subparsers.add_parser("move", help="Move WP to new priority (1-indexed)")
    move_parser.add_argument("wp_id", help="Work package ID (full, partial, or number only: WP-001, 1, 001)")
    move_parser.add_argument("priority", type=int, help="New priority (1-indexed)")

    # cites command
    cites_parser = subparsers.add_parser("cites", help="Resolve an identifier's citations transitively")
    cites_parser.add_argument("wp_id", nargs="?", help="Work package ID (full, partial, or number only: WP-001, 1, 001)")
    cites_parser.add_argument("identifier", help="Identifier (e.g. REQ-409, A-278, UC-042-01, F1)")
    cites_parser.add_argument("--all", dest="search_all", action="store_true", help="Search all work packages instead of scoping to one")

    # elements command
    elements_parser = subparsers.add_parser("elements", help="List every element row of a WP")
    elements_parser.add_argument("wp_id", help="Work package ID (full, partial, or number only: WP-001, 1, 001)")

    # cancel command
    cancel_parser = subparsers.add_parser("cancel", help="Cancel a WP and move it to concluded/")
    cancel_parser.add_argument("wp_id", help="Work package ID (full, partial, or number only: WP-001, 1, 001)")

    # create command
    create_parser = subparsers.add_parser("create", help="Create new work package")
    create_parser.add_argument("--name", help="Short identifier (e.g., 'user-auth')")
    create_parser.add_argument("--importance", choices=sorted(VALID_IMPORTANCE),
                              help="MoSCoW importance")
    create_parser.add_argument("--priority", type=int,
                              help="Priority (1-indexed, default: appends to end)")
    create_parser.add_argument("--proposal", nargs="+",
                              help="Proposal lines (3-5 lines)")
    create_parser.add_argument("-i", "--interactive", action="store_true",
                              help="Interactive mode - prompt for all fields")

    args = parser.parse_args()

    check_status_vocabulary()

    if args.command == "list":
        list_wps(include_concluded=args.all if hasattr(args, 'all') else False)
    elif args.command == "roadmap":
        roadmap(args.importance)
    elif args.command == "set-status":
        set_status(args.wp_id, args.status)
    elif args.command == "set-importance":
        set_importance(args.wp_id, args.importance)
    elif args.command == "rename":
        rename_wp(args.wp_id, args.new_name)
    elif args.command == "renumber":
        renumber_wps()
    elif args.command == "insert":
        insert_wp(args.priority, args.wp_id)
    elif args.command == "remove":
        remove_wp(args.wp_id)
    elif args.command == "move":
        move_wp(args.wp_id, args.priority)
    elif args.command == "cites":
        if not args.search_all and not args.wp_id:
            print("Usage: wp.py cites <wp_id> <identifier>  or  wp.py cites --all <identifier>")
            sys.exit(2)
        sys.exit(cites(args.identifier, wp_id=args.wp_id, search_all=args.search_all))
    elif args.command == "elements":
        sys.exit(elements(args.wp_id))
    elif args.command == "cancel":
        sys.exit(cancel_wp(args.wp_id))
    elif args.command == "create":
        create_wp(
            name=getattr(args, "name", None),
            importance=getattr(args, "importance", None),
            priority=getattr(args, "priority", None),
            proposal_lines=getattr(args, "proposal", None),
            interactive=args.interactive,
        )
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
