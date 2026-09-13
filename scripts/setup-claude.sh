#!/bin/bash
#
# setup-claude.sh
#
# Installs the Claude Code plugins this repo uses, then the skills
# (scripts/setup-skills.sh: Auctor, ai-docs-editor, memory-manager) into
# .claude/skills/ and .agents/skills/.
# Requires the LSP binaries from scripts/setup-devel-environment.sh
# (typescript-language-server) to be on PATH.
#
# Usage: ./scripts/setup-claude.sh

set -euo pipefail

show_help() {
    cat <<EOF
Usage: $0

Install the Claude Code plugins for this repository:
  - typescript-lsp  (LSP tool: goToDefinition, findReferences, hover, ...)

Then install the skills into .claude/skills/ and .agents/skills/ (see
scripts/setup-skills.sh): Auctor, ai-docs-editor, memory-manager.

Options:
  -h, --help    Show this help message

EOF
    exit 0
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    show_help
fi

# --- Use the Node version pinned in .nvmrc, when nvm is available ---
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use --silent >/dev/null 2>&1 || true
fi

if ! command -v claude >/dev/null 2>&1; then
    echo "❌ claude CLI not found on PATH." >&2
    exit 1
fi

if ! command -v typescript-language-server >/dev/null 2>&1; then
    echo "⚠️  typescript-language-server not found on PATH."
    echo "   Run ./scripts/setup-devel-environment.sh first."
    exit 1
fi

echo "🔗 Claude Code setup (pachanguero)"
echo "=================================="
echo ""

# Function to check if plugin is already installed
plugin_installed() {
    local plugin_name="$1"
    claude plugin list 2>/dev/null | grep -q "${plugin_name}"
}

# Function to install plugin with terminal-safe output
install_plugin() {
    local plugin="$1"
    local name="$2"

    if plugin_installed "${name}"; then
        echo "⊙ ${name} already installed, skipping..."
        return 0
    fi

    echo "Installing ${name}..."
    # Redirect stderr to avoid escape sequences breaking the terminal
    # Use --quiet if available, otherwise suppress stderr
    if claude plugin install "${plugin}" --quiet 2>/dev/null; then
        echo "✅ ${name} installed"
        return 0
    elif claude plugin install "${plugin}" 2>/dev/null; then
        echo "✅ ${name} installed"
        return 0
    else
        echo "⚠️  Failed to install ${name}"
        return 1
    fi
}

# This repo is TypeScript-only, so typescript-lsp is the one plugin it needs.
install_plugin "typescript-lsp@claude-plugins-official" "typescript-lsp"

echo ""
echo "=================================="
echo "✅ Claude Code plugins setup complete!"
echo ""

# --- Install skills (Auctor + the extra agentic-resources skills) ---
echo "=================================="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/setup-skills.sh"
echo ""

echo "Restart Claude Code (or run /reload-plugins) to activate the plugin."
echo "You can verify the server started in the /plugin Errors tab."

# Reset terminal state to fix any escape sequence issues
reset 2>/dev/null || tput reset 2>/dev/null || true
