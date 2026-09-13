#!/bin/bash
#
# setup-skills.sh
#
# Top-level skill installer for pachanguero. Installs into BOTH
# .claude/skills/ (Claude Code) and .agents/skills/ (generic agent tooling):
#   - the Auctor skills, rendered via setup-auctor.sh
#   - the extra agentic-resources skills below, symlinked
#
# Usage: ./scripts/setup-skills.sh
#
# Environment:
#   AGENTIC_RESOURCES_DIR   Path to the agentic-resources repo
#                           (default: ~/Workspace/agenticAI/agentic-resources)
#

set -euo pipefail

show_help() {
    cat <<EOF
Usage: $0

Install skills into .claude/skills/ and .agents/skills/:
  - Auctor skills (rendered via setup-auctor.sh)
  - ai-docs-editor, memory-manager (symlinked from agentic-resources)

Environment:
  AGENTIC_RESOURCES_DIR   Path to the agentic-resources repo
                          (default: ~/Workspace/agenticAI/agentic-resources)

Options:
  -h, --help    Show this help message

EOF
    exit 0
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    show_help
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

AGENTIC_RESOURCES_DIR="${AGENTIC_RESOURCES_DIR:-$HOME/Workspace/agenticAI/agentic-resources}"

# Plain (non-templated) skills, symlinked as-is.
EXTRA_SKILLS=(
    "${AGENTIC_RESOURCES_DIR}/agentic-docs-playbook/skills/ai-docs-editor"
    "${AGENTIC_RESOURCES_DIR}/memory-management/skills/memory-manager"
)

SKILLS_DIRS=(
    "${REPO_ROOT}/.claude/skills"
    "${REPO_ROOT}/.agents/skills"
)

echo "🧩 Installing skills (pachanguero)"
echo "==================================="
echo ""

for SKILLS_DIR in "${SKILLS_DIRS[@]}"; do
    echo "📂 ${SKILLS_DIR}"
    mkdir -p "${SKILLS_DIR}"

    echo "--- Auctor skills ---"
    "${SCRIPT_DIR}/setup-auctor.sh" "${SKILLS_DIR}"
    echo ""

    echo "--- Extra skills ---"
    for SKILL_SRC in "${EXTRA_SKILLS[@]}"; do
        if [ ! -d "${SKILL_SRC}" ]; then
            echo "⚠️  Warning: skill source not found: ${SKILL_SRC}"
            continue
        fi
        SKILL_NAME="$(basename "${SKILL_SRC}")"
        LINK_PATH="${SKILLS_DIR}/${SKILL_NAME}"

        if [ -e "${LINK_PATH}" ] && [ ! -L "${LINK_PATH}" ]; then
            echo "❌ Error: ${LINK_PATH} exists and is not a symlink — refusing to overwrite" >&2
            exit 1
        fi

        rm -f "${LINK_PATH}"
        ln -s "${SKILL_SRC}" "${LINK_PATH}"
        echo "✅ Linked: ${SKILL_NAME}"
    done
    echo ""
done

# --- .claudeignore: keeps Claude Code from scanning .agents/ as a duplicate
#     of .claude/. Gitignored (like .claude/ and .agents/ themselves), so it
#     has to be (re)written here rather than tracked in the repo. ---
echo ".agents" > "${REPO_ROOT}/.claudeignore"
echo "✅ Wrote .claudeignore"
echo ""

echo "==================================="
echo "✅ Skills installed."
