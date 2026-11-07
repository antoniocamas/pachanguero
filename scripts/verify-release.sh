#!/bin/bash
# Light checks around a release. Pachanguero is not critical, so there are few and they are cheap.
#   image     the built image starts on a throwaway database, takes an account and answers a login.
#             Nothing is pushed or deployed. Run it before ./build.sh --push.
#   deployed  the pod on erebor runs the released version, answers a request and logs no errors.
#             Run it after deploy/deploy.sh. The public address cannot be reached from the house:
#             the operator confirms it, and this mode says so in its last line.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The password of the throwaway account in the throwaway database; never a real one.
THROWAWAY_USER="verify-release"
THROWAWAY_PASSWORD="Pachanguero-dev-1"
K="${KUBECTL:-kubectl --context erebor -n pachanguero}"

usage() {
    echo "Usage: $0 image [--image NAME:TAG] [--db FILE]"
    echo "       $0 deployed --version X.Y.Z"
    echo ""
    echo "image     Starts the image on a throwaway database and logs in. Default image:"
    echo "          pachanguero:<package.json version>, the one ./build.sh builds."
    echo "          --db FILE starts it on a copy of FILE instead of an empty database (a scrubbed"
    echo "          copy of production from scripts/prod-copy.sh), so the migration is tried too."
    echo "          Needs docker. The account is created in the throwaway copy only."
    echo "deployed  Checks the pod: both containers ready, the image and PACHANGUERO_VERSION are"
    echo "          X.Y.Z, the app answers a request, and neither log has an error."
    echo "          KUBECTL overrides the kubectl command (default: --context erebor -n pachanguero)."
    echo ""
    echo "Exit 0 when every check passes; otherwise the failing check is named and the exit is 1."
}

fail() {
    echo "FAIL $1: $2" >&2
    exit 1
}

pass() {
    echo "ok   $1"
}

package_version() {
    node -p "require('$ROOT/package.json').version"
}

# ---- image ----------------------------------------------------------------------------------

# Global, so the exit trap still sees them after the function has returned.
work=""
container=""

verify_image() {
    local image="pachanguero:$(package_version)" db=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --image) image="$2"; shift 2 ;;
            --db) db="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
        esac
    done
    command -v docker >/dev/null || fail "docker" "docker is not installed"
    docker image inspect "$image" >/dev/null 2>&1 || fail "image exists" "$image is not built (run ./build.sh)"
    pass "image $image exists"

    local port
    work="$(mktemp -d)"
    chmod 700 "$work"
    mkdir "$work/data" "$work/backups"
    if [[ -n "$db" ]]; then
        [[ -f "$db" ]] || fail "database copy" "$db is not a file"
        cp "$db" "$work/data/pachanguero.db"
    fi
    # A secret made for this run only: it never leaves the container and is not production's.
    local secret
    secret="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"
    container="$(docker run -d --rm --user "$(id -u):$(id -g)" \
        -e JWT_SECRET="$secret" -e COOKIE_SECURE=false -e PACHANGUERO_VERSION=verify \
        -v "$work/data:/data" -v "$work/backups:/backups" \
        -p 127.0.0.1::8787 "$image")" || fail "image starts" "docker run failed"
    trap 'docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
    port="$(docker port "$container" 8787/tcp 2>/dev/null | sed -n 's/.*:\([0-9]*\)$/\1/p' | head -n 1 || true)"
    [[ -n "$port" ]] || fail "image starts" "the container stopped at once: $(docker logs "$container" 2>&1 | tail -n 3 | tr '\n' '|')"

    local up="false"
    for _ in $(seq 1 60); do
        if curl -fsS -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null; then up="true"; break; fi
        docker inspect "$container" >/dev/null 2>&1 || break
        sleep 1
    done
    if [[ "$up" != "true" ]]; then
        docker logs "$container" 2>&1 | tail -n 20 >&2 || true
        fail "image starts" "no answer on / within 60 s"
    fi
    pass "image starts and answers /"

    printf '%s\n%s\n' "$THROWAWAY_PASSWORD" "$THROWAWAY_PASSWORD" |
        docker exec -i "$container" pachanguero-admin create --username "$THROWAWAY_USER" --role admin >"$work/create.log" 2>&1 ||
        fail "account" "pachanguero-admin create failed: $(tail -n 2 "$work/create.log" | tr '\n' '|')"
    pass "throwaway account created"

    local code
    code="$(curl -sS -o "$work/login.json" -w '%{http_code}' -H 'Content-Type: application/json' \
        -d "{\"username\":\"$THROWAWAY_USER\",\"password\":\"$THROWAWAY_PASSWORD\"}" \
        "http://127.0.0.1:$port/api/auth/login")"
    [[ "$code" == "200" ]] || fail "login" "POST /api/auth/login answered $code, expected 200"
    grep -q '"accessToken"' "$work/login.json" || fail "login" "the answer has no accessToken"
    pass "login answers 200 with an access token"

    code="$(curl -sS -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
        -d "{\"username\":\"$THROWAWAY_USER\",\"password\":\"not-the-password\"}" \
        "http://127.0.0.1:$port/api/auth/login")"
    [[ "$code" == "401" ]] || fail "login refuses a wrong password" "answered $code, expected 401"
    pass "a wrong password is refused"

    if [[ -n "$db" ]]; then
        ls "$work/backups" | grep -Eq '^(release|periodic)_[0-9]{8}T[0-9]{6}Z_.+\.db$' ||
            echo "note: no backup was taken at start-up (the copy was already on the latest schema)"
    fi
    echo "image checks passed: $image"
}

# ---- deployed -------------------------------------------------------------------------------

verify_deployed() {
    local version=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --version) version="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
        esac
    done
    [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "deployed needs --version X.Y.Z" >&2; usage; exit 1; }

    local ready
    ready="$($K get pods -l app=pachanguero -o jsonpath='{range .items[*].status.containerStatuses[*]}{.name}={.ready}{"\n"}{end}')" ||
        fail "pod" "kubectl could not read the pod"
    [[ -n "$ready" ]] || fail "pod" "no pachanguero pod"
    if grep -qv '=true$' <<<"$ready"; then
        fail "containers ready" "not ready: $(grep -v '=true$' <<<"$ready" | tr '\n' ' ')"
    fi
    pass "both containers are ready"

    local images
    images="$($K get pods -l app=pachanguero -o jsonpath='{range .items[*].spec.containers[*]}{.image}{"\n"}{end}')"
    if grep -qv ":$version\$" <<<"$images"; then
        fail "image version" "expected :$version, the pod runs: $(tr '\n' ' ' <<<"$images")"
    fi
    local running
    running="$($K exec deploy/pachanguero -c pachanguero -- printenv PACHANGUERO_VERSION)" ||
        fail "running version" "could not read PACHANGUERO_VERSION in the pod"
    [[ "$running" == "$version" ]] || fail "running version" "PACHANGUERO_VERSION is '$running', expected '$version'"
    pass "the pod runs $version"

    local status
    status="$($K exec deploy/pachanguero -c pachanguero -- node -e \
        "fetch('http://127.0.0.1:8787/').then(r => console.log(r.status)).catch(() => console.log('none'))")" ||
        fail "request" "could not run the request in the pod"
    [[ "$status" == "200" ]] || fail "request" "GET / answered $status, expected 200"
    pass "the app answers GET / with 200"

    local container errors
    for container in pachanguero backup; do
        errors="$($K logs deploy/pachanguero -c "$container" --tail=500 | grep -Ei '\b(error|fatal|unhandled|exception)\b|backup failed' || true)"
        [[ -z "$errors" ]] || fail "logs ($container)" "$(head -n 3 <<<"$errors" | tr '\n' '|')"
    done
    pass "neither log has an error"

    echo "deployed checks passed: $version"
    echo "NOT VERIFIED: the public address. From outside the house: curl -I https://pachanguero.duckdns.org must answer 200 over a valid certificate; the operator confirms it."
}

case "${1:-}" in
    image) shift; verify_image "$@" ;;
    deployed) shift; verify_deployed "$@" ;;
    -h|--help) usage ;;
    *) usage >&2; exit 1 ;;
esac
