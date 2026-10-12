#!/usr/bin/env python3
"""Enable Banking PoC: read the Bizums received in a personal Revolut account.

Throwaway script (WP-005). One subcommand per step; the only shared state is the
files in poc/local/ (git-ignored: key, config, session, raw data). Read README.md.
"""
import argparse
import collections
import hashlib
import json
import os
import re
import sqlite3
import sys
import tempfile
import unicodedata
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import jwt
import requests

BASE = "https://api.enablebanking.com"
LOCAL = Path(os.environ.get("EBPOC_LOCAL") or Path(__file__).resolve().parent / "local")
CONFIG = LOCAL / "config.json"
SESSION = LOCAL / "session.json"
PENDING = LOCAL / "pending_auth.json"
PREVIOUS = LOCAL / "session.prev.json"
STORE = LOCAL / "transactions.jsonl"
LIMITS_LOG = LOCAL / "reports" / "limits.jsonl"
DEPTH_LOG = LOCAL / "reports" / "depth.jsonl"
BIZUM_PREFIX = "Bizum payment from: "
SESSION_ERRORS = {"EXPIRED_SESSION", "CLOSED_SESSION", "REVOKED_SESSION"}


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(f"{status} {code}: {message}")
        self.status, self.code, self.message = status, code, message


# ---------------------------------------------------------------- core


def load_json(path):
    if not path.exists():
        sys.exit(f"missing {path.relative_to(LOCAL.parent)}")
    return json.loads(path.read_text())


def save_json(path, data):
    LOCAL.mkdir(exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


def make_jwt(config):
    key = (LOCAL / config["key_path"]).read_bytes()
    iat = int(time.time())
    claims = {"iss": "enablebanking.com", "aud": "api.enablebanking.com", "iat": iat, "exp": iat + 3600}
    return jwt.encode(claims, key, algorithm="RS256", headers={"typ": "JWT", "kid": config["app_id"]})


def api(method, path, config, **kwargs):
    headers = {"Authorization": f"Bearer {make_jwt(config)}"}
    resp = requests.request(method, BASE + path, headers=headers, timeout=60, **kwargs)
    body = resp.json() if resp.content else {}
    if not resp.ok:
        raise ApiError(resp.status_code, body.get("error", "?"), body.get("message", resp.text[:200]))
    return body


def report_error(err):
    print(f"API error: {err}", file=sys.stderr)
    if err.code in SESSION_ERRORS:
        print("The session is no longer usable: run `auth` and `session` again (re-authorisation).", file=sys.stderr)
    sys.exit(1)


def parse_redirect(url):
    """Pull code and state out of the URL the browser was redirected to."""
    query = parse_qs(urlparse(url.strip()).query)
    first = lambda k: query.get(k, [None])[0]  # noqa: E731
    return {"code": first("code"), "state": first("state"), "error": first("error"),
            "error_description": first("error_description")}


# ---------------------------------------------------------------- commands


def cmd_aspsps(args, config):
    data = api("GET", "/aspsps", config, params={"country": args.country})
    found = [a for a in data["aspsps"] if "revolut" in a["name"].lower()]
    if not found:
        print(f"No ASPSP with 'Revolut' in its name for country {args.country} ({len(data['aspsps'])} listed).")
        return
    for a in found:
        days = a.get("maximum_consent_validity", 0) / 86400
        print(json.dumps({
            "name": a["name"], "country": a["country"], "psu_types": a.get("psu_types"),
            "maximum_consent_validity_days": days, "required_psu_headers": a.get("required_psu_headers"),
            "auth_methods": [m.get("name") for m in a.get("auth_methods", [])] or None,
        }, indent=2))


def cmd_auth(args, config):
    aspsp = config["aspsp"]
    days = args.days
    if days is None:
        listing = api("GET", "/aspsps", config, params={"country": aspsp["country"]})["aspsps"]
        match = [a for a in listing if a["name"] == aspsp["name"]]
        days = match[0]["maximum_consent_validity"] / 86400 if match else 90
        days = max(1, int(days) - 1)
    valid_until = (datetime.now(timezone.utc) + timedelta(days=days)).replace(microsecond=0).isoformat()
    state = uuid.uuid4().hex
    data = api("POST", "/auth", config, json={
        "access": {"valid_until": valid_until}, "aspsp": aspsp, "state": state,
        "redirect_url": config["redirect_url"], "psu_type": "personal"})
    save_json(PENDING, {"state": state, "authorization_id": data.get("authorization_id"), "valid_until": valid_until})
    print(f"Consent requested until {valid_until} ({days} days).")
    print("Open this URL in the browser on this computer and approve in the Revolut app:\n")
    print(data["url"])
    print("\nThen copy the full address of the page you land on and run: session '<that address>'")


def cmd_session(args, config):
    redirect = parse_redirect(args.url)
    if redirect["error"]:
        sys.exit(f"The bank returned an error: {redirect['error']} {redirect['error_description']}")
    if not redirect["code"]:
        sys.exit("No `code` in that address.")
    pending = load_json(PENDING)
    if redirect["state"] != pending["state"]:
        sys.exit("The `state` does not match the last `auth` run; start again with `auth`.")
    data = api("POST", "/sessions", config, json={"code": redirect["code"]})
    accounts = [{"uid": a["uid"], "identification_hash": a.get("identification_hash")}
                for a in data.get("accounts", [])]
    old = SESSION.exists()
    if old:
        save_json(PREVIOUS, load_json(SESSION))
    save_json(SESSION, {"session_id": data["session_id"], "valid_until": data.get("access", {}).get("valid_until"),
                        "created": datetime.now(timezone.utc).isoformat(), "accounts": accounts,
                        "previous_session_kept": old})
    PENDING.unlink(missing_ok=True)
    print(f"Session {data['session_id']} stored with {len(accounts)} account(s).")
    if not accounts:
        print("The account list is empty: the account is not linked to this application. "
              "Link it in the Control Panel first (restricted mode only reads linked accounts).")
    else:
        for a in accounts:
            print(f"  uid {a['uid']}  identification_hash {a['identification_hash']}")
    print("required_psu_headers for the ASPSP are listed by `aspsps` (empty means none needed).")


def cmd_status(args, config):
    session = load_json(PREVIOUS if args.previous else SESSION)
    data = api("GET", f"/sessions/{session['session_id']}", config)
    print(json.dumps({"status": data.get("status"), "valid_until": data.get("access", {}).get("valid_until"),
                      "accounts": len(data.get("accounts", []))}, indent=2))


def cmd_close(args, config):
    session = load_json(PREVIOUS if args.previous else SESSION)
    print(api("DELETE", f"/sessions/{session['session_id']}", config))
    print("Session closed; the stored session.json is now stale (run `status` to see the code).")

def cmd_accounts(args, config):
    """Show what the bank says about each account (no IBAN or owner printed)."""
    session = load_json(SESSION)
    for a in session["accounts"]:
        try:
            d = api("GET", f"/accounts/{a['uid']}/details", config)
        except ApiError as err:
            print(f"{a['uid']}: {err}")
            continue
        keep = {k: d.get(k) for k in ("currency", "product", "cash_account_type", "usage", "details", "name")}
        print(a["uid"], json.dumps({k: v for k, v in keep.items() if v is not None}))


def stored_keys():
    if not STORE.exists():
        return set()
    return {json.loads(line)["_hash"] for line in STORE.read_text().splitlines() if line}


def tx_key(account_hash, tx):
    ref = tx.get("entry_reference")
    if ref:
        return f"{account_hash}|{ref}"
    basis = json.dumps({k: tx.get(k) for k in ("booking_date", "value_date", "transaction_amount",
                                                 "credit_debit_indicator", "remittance_information",
                                                 "debtor", "creditor")}, sort_keys=True)
    return f"{account_hash}|content:{hashlib.sha256(basis.encode()).hexdigest()[:16]}"


def cmd_fetch(args, config):
    session = load_json(SESSION)
    accounts = [a for a in session["accounts"] if not args.account or a["uid"] == args.account]
    if not accounts:
        sys.exit("No such account in session.json (use `accounts` to list uids).")
    seen = stored_keys()
    LOCAL.mkdir(exist_ok=True)
    for a in accounts:
        params = {"date_from": args.date_from}
        if args.strategy:
            params["strategy"] = args.strategy
        counts = {"fetched": 0, "new": 0, "known": 0, "pending_skipped": 0, "no_reference": 0, "pages": 0}
        earliest = None
        while True:
            data = api("GET", f"/accounts/{a['uid']}/transactions", config, params=params)
            counts["pages"] += 1
            txs = data.get("transactions", [])
            if not txs:
                counts["empty_pages"] = counts.get("empty_pages", 0) + 1
            with STORE.open("a") as out:
                for tx in txs:
                    counts["fetched"] += 1
                    day = tx.get("booking_date") or tx.get("value_date") or tx.get("transaction_date")
                    if day and (earliest is None or day < earliest):
                        earliest = day
                    if tx.get("status") == "PDNG":
                        counts["pending_skipped"] += 1
                        continue
                    if not tx.get("entry_reference"):
                        counts["no_reference"] += 1
                    key = tx_key(a["identification_hash"], tx)
                    if key in seen:
                        counts["known"] += 1
                        continue
                    seen.add(key)
                    counts["new"] += 1
                    out.write(json.dumps({**tx, "_hash": key, "_account_uid": a["uid"],
                                          "_fetched_at": datetime.now(timezone.utc).isoformat()}) + "\n")
            if not data.get("continuation_key"):
                break
            params["continuation_key"] = data["continuation_key"]
        print(a["uid"], json.dumps({**counts, "earliest_date": earliest}))


def bizum_sender(tx):
    """The sender of an incoming Bizum (rule in iterations/1/DESIGN_PLAN.md), else None."""
    if tx.get("credit_debit_indicator") != "CRDT" or tx.get("status") != "BOOK":
        return None
    remittance = tx.get("remittance_information") or []
    if len(remittance) == 2 and remittance[-1].startswith(BIZUM_PREFIX):
        return remittance[-1][len(BIZUM_PREFIX):].strip()
    return None


def cmd_recognise(args, config):
    if not STORE.exists():
        sys.exit("no transactions stored: run `fetch` first")
    found = []
    for line in STORE.read_text().splitlines():
        tx = json.loads(line)
        sender = bizum_sender(tx)
        if sender is not None:
            found.append({"booking_date": tx.get("booking_date"), "amount": tx["transaction_amount"]["amount"],
                          "currency": tx["transaction_amount"]["currency"], "sender": sender,
                          "message": (tx.get("remittance_information") or [""])[0], "_hash": tx["_hash"]})
    phones = [f for f in found if re.fullmatch(r"\+\d+", f["sender"])]
    print(json.dumps({"bizums": len(found), "sender_is_phone": len(phones),
                      "sender_is_name": len(found) - len(phones),
                      "distinct_senders": len({f["sender"] for f in found})}))
    if args.show:
        for f in found:
            print(f["booking_date"], f["amount"], f["currency"], f["sender"], "|", f["message"])
    if args.out:
        (LOCAL / "reports").mkdir(exist_ok=True)
        (LOCAL / "reports" / "bizums.jsonl").write_text("\n".join(json.dumps(f) for f in found) + "\n")
        print("written to local/reports/bizums.jsonl")


# ---- player matching (port of server/src/domain/name-stripper.ts and name-matcher.ts)

LIST_MARKER = re.compile(r"^\s*(?:\d+[.)]?|[•\-*])\s*")
EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\ufe0f]")


def strip_decoration(raw):
    text = "".join(ch for ch in raw if unicodedata.category(ch) != "Cf")
    return re.sub(r"\s+", " ", EMOJI.sub("", LIST_MARKER.sub("", text))).strip()


def fold(text):
    """Case- and accent-insensitive form, like localeCompare(..., 'es', {sensitivity: 'base'})."""
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn").casefold()


def split_abbreviated(sender):
    """'Juan Carlos P.G.' -> (['juan', 'carlos'], ['p', 'g']); a sender without initials -> (tokens, [])."""
    tokens = fold(strip_decoration(sender)).split(" ")
    initials = []
    while tokens and re.fullmatch(r"(?:[a-z]\.)+", tokens[-1]):
        initials = [c for c in tokens.pop() if c.isalpha()] + initials
    return tokens, initials


def match_sender(sender, players, aliases):
    """Outcome of one sender: tier is 'exact' (NameMatcher's rule), 'abbreviated' or 'first_name'."""
    if re.fullmatch(r"\+\d+", sender):
        return {"outcome": "unresolved", "tier": "phone", "players": []}
    name = fold(strip_decoration(sender))
    exact = {pid for pid, n in players if fold(n) == name} | {pid for pid, a in aliases if fold(a) == name}
    if exact:
        return {"outcome": "matched" if len(exact) == 1 else "ambiguous", "tier": "exact", "players": sorted(exact)}
    given, initials = split_abbreviated(sender)
    if not given or not initials:
        return {"outcome": "unresolved", "tier": "none", "players": []}
    full, first_only = set(), set()
    for pid, n in players:
        tokens = fold(strip_decoration(n)).split(" ")
        if tokens[: len(given)] != given:
            continue
        rest = [t[0] for t in tokens[len(given):]]
        if not rest:
            first_only.add(pid)
        elif rest[: len(initials)] == initials[: len(rest)]:
            full.add(pid)
    for tier, ids in (("abbreviated", full), ("first_name", first_only)):
        if ids:
            return {"outcome": "matched" if len(ids) == 1 else "ambiguous", "tier": tier, "players": sorted(ids)}
    return {"outcome": "unresolved", "tier": "none", "players": []}


def cmd_match(args, config):
    path = Path(args.db).resolve()
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    players = conn.execute("select id, name from players").fetchall()
    aliases = conn.execute("select player_id, alias from player_aliases").fetchall()
    conn.close()
    names = {pid: n for pid, n in players}
    senders = collections.Counter()
    for line in STORE.read_text().splitlines():
        sender = bizum_sender(json.loads(line))
        if sender is not None:
            senders[sender] += 1
    rows = {s: match_sender(s, players, aliases) for s in senders}
    by_tier = collections.Counter((r["tier"], r["outcome"]) for r in rows.values())
    weighted = collections.Counter((r["tier"], r["outcome"]) for s, r in rows.items() for _ in range(senders[s]))
    print(json.dumps({"players": len(players), "aliases": len(aliases), "distinct_senders": len(senders),
                      "bizums": sum(senders.values()),
                      "senders_by_tier_outcome": {f"{t}/{o}": n for (t, o), n in sorted(by_tier.items())},
                      "bizums_by_tier_outcome": {f"{t}/{o}": n for (t, o), n in sorted(weighted.items())}}, indent=2))
    (LOCAL / "reports").mkdir(exist_ok=True)
    report = [{"sender": s, "bizums": senders[s], **r, "player_names": [names[i] for i in r["players"]]}
              for s, r in rows.items()]
    (LOCAL / "reports" / "matches.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    if args.show:
        for row in report:
            print(row["sender"], "->", row["tier"], row["outcome"], row["player_names"])
    print("details in local/reports/matches.json")


def summarise_limits(entries):
    """Summary of a limits log: calls made, first 429 and the calls before it, last attempt."""
    ok_before, first_429 = 0, None
    for e in entries:
        if e["outcome"] == "ok" and first_429 is None:
            ok_before += 1
        elif e["error"] == "ASPSP_RATE_LIMIT_EXCEEDED" and first_429 is None:
            first_429 = e["time"]
    return {"attempts": len(entries), "ok_before_first_429": ok_before, "first_429_at": first_429,
            "last_attempt": entries[-1] if entries else None,
            "ok_since_first_429": sum(1 for e in entries if first_429 and e["time"] > first_429 and e["outcome"] == "ok")}


def append_log(path, entry):
    path.parent.mkdir(exist_ok=True)
    with path.open("a") as out:
        out.write(json.dumps(entry) + "\n")


def read_log(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line] if path.exists() else []


def cmd_limits(args, config):
    """Repeat one small fetch until the first 429, logging every attempt. Never retries after a 429."""
    session = load_json(SESSION)
    uid = args.account or session["accounts"][0]["uid"]
    date_from = (datetime.now(timezone.utc) - timedelta(days=args.days)).date().isoformat()
    for i in range(1, args.max + 1):
        started = time.time()
        entry = {"time": datetime.now(timezone.utc).isoformat(), "attempt_in_run": i, "outcome": "ok",
                 "error": None, "http": 200}
        try:
            api("GET", f"/accounts/{uid}/transactions", config, params={"date_from": date_from})
        except ApiError as err:
            entry.update(outcome="error", error=err.code, http=err.status)
        entry["seconds"] = round(time.time() - started, 2)
        append_log(LIMITS_LOG, entry)
        print(f"{i}: {entry['outcome']} {entry['error'] or ''} ({entry['seconds']}s)")
        if entry["outcome"] == "error":
            if entry["error"] == "ASPSP_RATE_LIMIT_EXCEEDED":
                print("Rate limit reached. Do not retry now: the Enable Banking FAQ suggests about 6 hours; "
                      "measure the real recovery by running `limits --max 1` later (every attempt is logged).")
            break
        time.sleep(args.sleep)
    print(json.dumps(summarise_limits(read_log(LIMITS_LOG)), indent=2))


def cmd_depth(args, config):
    """Earliest booking date available now with strategy=longest (reads every page, nothing stored)."""
    session = load_json(SESSION)
    uid = args.account or session["accounts"][0]["uid"]
    created = datetime.fromisoformat(session["created"])
    params = {"date_from": args.date_from, "strategy": "longest"}
    earliest, pages, truncated = None, 0, False
    while True:
        data = api("GET", f"/accounts/{uid}/transactions", config, params=params)
        pages += 1
        for tx in data.get("transactions", []):
            day = tx.get("booking_date") or tx.get("value_date") or tx.get("transaction_date")
            if day and (earliest is None or day < earliest):
                earliest = day
        if not data.get("continuation_key"):
            break
        if pages >= args.max_pages:
            truncated = True
            break
        params["continuation_key"] = data["continuation_key"]
    now = datetime.now(timezone.utc)
    entry = {"time": now.isoformat(), "hours_since_authorisation": round((now - created).total_seconds() / 3600, 2),
             "requested_from": args.date_from, "earliest_booking_date": earliest, "pages": pages,
             "truncated_at_max_pages": truncated}
    append_log(DEPTH_LOG, entry)
    print(json.dumps(entry, indent=2))
    for e in read_log(DEPTH_LOG)[:-1]:
        print("earlier:", e["hours_since_authorisation"], "h ->", e["earliest_booking_date"])


def cmd_selfcheck(args, config):
    url = "https://example.com/callback?state=abc123&code=XYZ-1"
    got = parse_redirect(url)
    assert got["code"] == "XYZ-1" and got["state"] == "abc123", got
    err = parse_redirect("https://example.com/callback?error=access_denied&error_description=no")
    assert err["error"] == "access_denied" and err["code"] is None, err
    assert parse_redirect("https://example.com/callback")["code"] is None
    base = {"credit_debit_indicator": "CRDT", "status": "BOOK",
            "remittance_information": ["cancha", "Bizum payment from: Ana B.C."]}
    assert bizum_sender(base) == "Ana B.C."
    assert bizum_sender({**base, "remittance_information": ["x", "Bizum payment from: +34600000000"]}) == "+34600000000"
    assert bizum_sender({**base, "credit_debit_indicator": "DBIT"}) is None
    assert bizum_sender({**base, "status": "PDNG"}) is None
    assert bizum_sender({**base, "remittance_information": ["Dinero de Ana"]}) is None
    assert bizum_sender({**base, "remittance_information": ["Bizum payment from: Ana B.C."]}) is None
    players = [(1, "Ana"), (2, "Ana Beltrán Cruz"), (3, "Luis Pérez"), (4, "Luis Pardo"), (5, "María José")]
    aliases = [(3, "Lucho")]
    assert match_sender("Ana B.C.", players, aliases)["players"] == [2]
    assert match_sender("Ana B.C.", players, aliases)["tier"] == "abbreviated"
    assert match_sender("Ana X.Y.", players, aliases) == {"outcome": "matched", "tier": "first_name", "players": [1]}
    assert match_sender("Luis P.", players, aliases)["outcome"] == "ambiguous"
    assert match_sender("🙂 ana", players, aliases) == {"outcome": "matched", "tier": "exact", "players": [1]}
    assert match_sender("LUCHO", players, aliases)["players"] == [3]
    assert match_sender("María José G.", players, aliases)["tier"] == "first_name"
    assert match_sender("Zoe Q.R.", players, aliases)["outcome"] == "unresolved"
    assert match_sender("+34600000000", players, aliases)["tier"] == "phone"
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "t.db"
        conn = sqlite3.connect(db)
        conn.execute("create table players(id integer, name text)")
        conn.execute("insert into players values (1,'Ana')")
        conn.commit(); conn.close()
        before = db.stat().st_mtime_ns
        ro = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        ro.execute("select * from players").fetchall(); ro.close()
        assert db.stat().st_mtime_ns == before, "read-only open changed the file"
    log = [{"time": "2026-01-01T10:00:00", "outcome": "ok", "error": None},
           {"time": "2026-01-01T10:00:01", "outcome": "ok", "error": None},
           {"time": "2026-01-01T10:00:02", "outcome": "error", "error": "ASPSP_RATE_LIMIT_EXCEEDED"},
           {"time": "2026-01-01T16:10:00", "outcome": "ok", "error": None}]
    got = summarise_limits(log)
    assert got["ok_before_first_429"] == 2 and got["first_429_at"] == "2026-01-01T10:00:02", got
    assert got["ok_since_first_429"] == 1 and got["attempts"] == 4, got
    assert summarise_limits([])["attempts"] == 0
    h = "HASH"
    booked = {"entry_reference": "R1", "status": "BOOK"}
    assert tx_key(h, booked) == "HASH|R1"
    assert tx_key(h, {"booking_date": "2026-01-01", "transaction_amount": {"amount": "4"}}).startswith("HASH|content:")
    assert tx_key(h, {"booking_date": "2026-01-01"}) == tx_key(h, {"booking_date": "2026-01-01"})
    print("selfcheck ok")


COMMANDS = {"limits": cmd_limits, "depth": cmd_depth, "match": cmd_match, "recognise": cmd_recognise, "accounts": cmd_accounts, "fetch": cmd_fetch, "aspsps": cmd_aspsps, "auth": cmd_auth, "session": cmd_session,
            "status": cmd_status, "close": cmd_close, "selfcheck": cmd_selfcheck}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("aspsps", help="list Revolut in a country").add_argument("country")
    sub.add_parser("auth", help="start an authorisation").add_argument("--days", type=int)
    sub.add_parser("session", help="create the session from the redirected URL").add_argument("url")
    sub.add_parser("accounts", help="show the details of each account in the session")
    fetch = sub.add_parser("fetch", help="download transactions into local/transactions.jsonl")
    fetch.add_argument("--from", dest="date_from", required=True, help="YYYY-MM-DD")
    fetch.add_argument("--strategy", choices=["default", "longest"])
    fetch.add_argument("--account", help="only this account uid")
    rec = sub.add_parser("recognise", help="list the incoming Bizums in the stored transactions")
    rec.add_argument("--show", action="store_true", help="print one line per Bizum")
    rec.add_argument("--out", action="store_true", help="write local/reports/bizums.jsonl")
    mt = sub.add_parser("match", help="match the Bizum senders to the players (read-only)")
    mt.add_argument("--db", required=True, help="Pachanguero SQLite file, opened read-only")
    mt.add_argument("--show", action="store_true", help="print one line per distinct sender")
    lim = sub.add_parser("limits", help="probe the rate limit: repeat one small fetch until a 429 (logged)")
    lim.add_argument("--max", type=int, default=10, help="maximum calls in this run")
    lim.add_argument("--days", type=int, default=7, help="size of the fetched range")
    lim.add_argument("--sleep", type=float, default=0, help="seconds between calls")
    lim.add_argument("--account")
    dep = sub.add_parser("depth", help="earliest booking date available now (strategy=longest, nothing stored)")
    dep.add_argument("--from", dest="date_from", default="2015-01-01")
    dep.add_argument("--max-pages", type=int, default=60)
    dep.add_argument("--account")
    sub.add_parser("status", help="show the stored session's status").add_argument(
        "--previous", action="store_true", help="the session replaced by the last `session` run")
    sub.add_parser("close", help="close the stored session").add_argument(
        "--previous", action="store_true", help="the session replaced by the last `session` run")
    sub.add_parser("selfcheck", help="check the pure helpers on synthetic data")
    args = parser.parse_args()
    config = {} if args.command == "selfcheck" else load_json(CONFIG)
    try:
        COMMANDS[args.command](args, config)
    except ApiError as err:
        report_error(err)


if __name__ == "__main__":
    main()
