#!/bin/bash
#
# setup-auctor.sh
#
# Installs the Auctor skills (from the auctor repo) into this project's
# .claude/skills/ and scaffolds the specs repo (wp.py, active/, concluded/,
# actions/) at specs/, using ai-kit/auctor-config.json for project config
# (repo_name, guideline docs, test/lint runners, ...).
#
# Usage: ./scripts/setup-auctor.sh [skills-dir]
#   skills-dir: Target directory for skills (default: <repo>/.claude/skills)
#

set -euo pipefail

show_help() {
    cat <<EOF
Usage: $0 [skills-dir]

Install the Auctor skills and scaffold the specs repo for pachanguero.

Arguments:
  skills-dir    Target directory for skills (default: <repo>/.claude/skills)

Environment:
  AUCTOR_DIR    Path to the auctor repository
                (default: ~/Workspace/agenticAI/agentic-resources/auctor)

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

AUCTOR_DIR="${AUCTOR_DIR:-$HOME/Workspace/agenticAI/agentic-resources/auctor}"
CONFIG_FILE="${REPO_ROOT}/ai-kit/auctor-config.json"
SPECS_DIR="${REPO_ROOT}/specs"
SKILLS_DIR="${1:-${REPO_ROOT}/.claude/skills}"

INSTALL="${AUCTOR_DIR}/install.py"

if [ ! -f "${INSTALL}" ]; then
    echo "❌ Error: install.py not found: ${INSTALL}" >&2
    echo "   Set AUCTOR_DIR to the auctor repository if it lives elsewhere." >&2
    exit 1
fi

if [ ! -f "${CONFIG_FILE}" ]; then
    echo "❌ Error: Config file not found: ${CONFIG_FILE}" >&2
    exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
    echo "❌ Error: uv not found on PATH (needed to run the auctor installer)." >&2
    exit 1
fi

echo "📦 Installing Auctor skills into: ${SKILLS_DIR}"
echo "📋 Specs repo at: ${SPECS_DIR}"
echo ""

mkdir -p "${SKILLS_DIR}"

uv run --project "${AUCTOR_DIR}" \
    "${INSTALL}" --config "${CONFIG_FILE}" \
    -d "${SKILLS_DIR}" \
    -s "${SPECS_DIR}"

echo ""
echo "✅ Auctor set up."
