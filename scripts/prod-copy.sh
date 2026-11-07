#!/bin/bash
# Copy the production database from erebor to data/prod-copy/ and make it safe to use locally.
# Then `npm run dev:prod-copy` runs the app against it. Production is only read.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/data/prod-copy"
DB="$DIR/pachanguero.db"
ENV_FILE="$DIR/.env"
K="kubectl --context erebor -n pachanguero"
FRESH="false"
KEEP_BANK="false"
FROM=""

usage() {
    echo "Usage: $0 [--fresh] [--keep-bank] [--from FILE]"
    echo ""
    echo "Copies the production database to $DIR/pachanguero.db (replacing the previous copy),"
    echo "creates $ENV_FILE the first time (its own JWT_SECRET, never production's), and scrubs"
    echo "the copy: production sessions ended, every account's password set to Pachanguero-dev-1."
    echo ""
    echo "Options:"
    echo "  --fresh       Take a new periodic backup in the pod first (it is kept in the pod's /backups,"
    echo "                the staging folder the backup shipper reads). Default: the newest existing"
    echo "                backup, periodic or release"
    echo "  --keep-bank   Keep the bank connection (default: removed, its session is a live credential)"
    echo "  --from FILE   Use this local database file instead of fetching one from erebor"
    echo "  -h, --help    Show this help"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --fresh) FRESH="true"; shift ;;
        --keep-bank) KEEP_BANK="true"; shift ;;
        --from) FROM="$2"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
    esac
done

umask 077
mkdir -p "$DIR"
chmod 700 "$DIR"
TMP="$DIR/incoming.db"
rm -f "$TMP"

if [[ -n "$FROM" ]]; then
    cp "$FROM" "$TMP"
else
    POD="$($K get pod -l app=pachanguero -o jsonpath='{.items[0].metadata.name}')"
    if [[ "$FRESH" == "true" ]]; then
        SOURCE="$($K exec "$POD" -c pachanguero -- pachanguero-admin backup | sed -n 's/^✓ //p')"
    else
        SOURCE="$($K exec "$POD" -c backup -- sh -c 'ls -1t /backups/periodic_*.db /backups/release_*.db 2>/dev/null | head -n 1')"
    fi
    if [[ -z "$SOURCE" ]]; then
        echo "No backup found in the pod" >&2
        exit 1
    fi
    echo "Copying $SOURCE from $POD"
    $K cp "$POD:$SOURCE" "$TMP" -c backup
fi

rm -f "$DB" "$DB-wal" "$DB-shm"
mv "$TMP" "$DB"
chmod 600 "$DB"

if [[ ! -f "$ENV_FILE" ]]; then
    SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"
    cat > "$ENV_FILE" <<EOF
# The local copy of production (scripts/prod-copy.sh). Created once and kept: edit it freely.
# Read instead of the repository's .env by \`npm run dev:prod-copy\`.
JWT_SECRET=$SECRET
PACHANGUERO_DB=$DB
PACHANGUERO_BACKUPS=$DIR/backups
COOKIE_SECURE=false
# To use the bank connection kept with --keep-bank, add the bank settings (.env.example):
# PACHANGUERO_PUBLIC_URL=http://localhost:5173
# ENABLE_BANKING_APP_ID=
# ENABLE_BANKING_PRIVATE_KEY=
EOF
    echo "Created $ENV_FILE"
fi

SCRUB_ARGS=(--env-file "$ENV_FILE")
[[ "$KEEP_BANK" == "true" ]] && SCRUB_ARGS+=(--keep-bank)
npm run --silent scrub-prod-copy --prefix "$ROOT/server" -- "${SCRUB_ARGS[@]}"

echo "Ready: npm run dev:prod-copy, then sign in at http://localhost:5173 with any username and Pachanguero-dev-1"
