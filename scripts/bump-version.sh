#!/bin/bash
# Set the release version in every place that carries it: package.json, package-lock.json and the
# Helm chart (version and appVersion). It edits files only: committing and tagging are separate steps.
# Usage: scripts/bump-version.sh <X.Y.Z>     set the version
#        scripts/bump-version.sh --check     fail unless the three places agree
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHART="$ROOT/deploy/helm/pachanguero/Chart.yaml"

package_version() { node -p "require('$ROOT/package.json').version"; }
chart_field() { sed -n "s/^$1: *['\"]\{0,1\}\([0-9][0-9.]*\)['\"]\{0,1\}\$/\1/p" "$CHART"; }

if [[ "${1:-}" == "--check" ]]; then
    pkg=$(package_version); ver=$(chart_field version); app=$(chart_field appVersion)
    echo "package.json $pkg · chart version $ver · chart appVersion $app"
    [[ "$pkg" == "$ver" && "$pkg" == "$app" ]] || { echo "Versions differ" >&2; exit 1; }
    exit 0
fi

NEW="${1:-}"
[[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Usage: $0 <X.Y.Z> | --check" >&2; exit 1; }
if git -C "$ROOT" rev-parse -q --verify "refs/tags/v$NEW" >/dev/null; then
    echo "Error: tag v$NEW already exists; a released version is never reused" >&2
    exit 1
fi

cd "$ROOT"
npm version "$NEW" --no-git-tag-version --allow-same-version >/dev/null
sed -i "s/^version: .*/version: $NEW/; s/^appVersion: .*/appVersion: '$NEW'/" "$CHART"
"$0" --check
