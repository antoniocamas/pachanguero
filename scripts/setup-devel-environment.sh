#!/bin/bash
#
# setup-devel-environment.sh
#
# Sets up everything needed to develop pachanguero:
#   - project dependencies (server + web workspaces)
#   - global TypeScript LSP tooling for Claude Code
#   - Claude Code plugins (scripts/setup-claude.sh)
#   - skills: Auctor, ai-docs-editor, memory-manager, into .claude/skills/
#     and .agents/skills/ (scripts/setup-skills.sh)
#
# No pyright / pyrightconfig.json: those are Python-only (unlike
# trading-monolith, this repo has no Python).
#
# Usage: ./scripts/setup-devel-environment.sh

set -euo pipefail

show_help() {
    cat <<EOF
Usage: $0

Install project dependencies, the TypeScript LSP tooling
(typescript + typescript-language-server, global via npm), the Claude Code
plugins, and the skills (Auctor, ai-docs-editor, memory-manager).

Options:
  -h, --help    Show this help message

EOF
    exit 0
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    show_help
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🔧 Pachanguero development environment"
echo "======================================"
echo ""

# --- Use the Node version pinned in .nvmrc, when nvm is available ---
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use --silent >/dev/null 2>&1 || true
fi

if ! command -v node >/dev/null 2>&1; then
    echo "❌ node not found on PATH."
    echo "   Install nvm and the version pinned in .nvmrc:  nvm install"
    exit 1
fi

echo "Using node $(node --version) / npm $(npm --version)"
echo ""

# --- Project dependencies (both workspaces) ---
echo "📦 Installing project dependencies (server + web)..."
cd "${REPO_ROOT}"
npm install
echo ""

# --- Global LSP tooling for Claude Code ---
echo "🌐 Installing global TypeScript LSP tooling..."
npm install -g typescript typescript-language-server
echo ""

# --- Verify ---
echo "✅ Setup complete:"
echo "   node                       $(node --version)"
echo "   tsc                        $(tsc --version)"
echo "   typescript-language-server $(typescript-language-server --version)"
echo ""

# --- Claude Code plugins + skills (Auctor, ai-docs-editor, memory-manager) ---
echo "======================================"
"${REPO_ROOT}/scripts/setup-claude.sh"
