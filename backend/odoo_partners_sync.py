"""
Odoo partners sync -> Supabase customer_odoo_aliases (INSERT-ONLY).

Brings every Odoo res.partner that passes the filter below into
customer_odoo_aliases with customer_id NULL. Existing rows are never updated:
all writes go through the database function insert_new_odoo_partners(jsonb),
which does INSERT ... ON CONFLICT (odoo_partner_id) DO NOTHING and has no
customer_id in its column list. The only table this script ever overwrites is
the scratch table odoo_partner_stage, and only in --stage mode.

Designed to run as a Railway Cron Job (schedule "0 * * * *", UTC), same shape
as odoo_leads_sync.py: stateless between runs, progress in sync_state.

Modes (at most one):
    (none)             hourly incremental run
    --count            read-only: counts only, Odoo only (no Supabase access)
    --dry-run          incremental logic, writes nothing, reports would-insert
    --stage            one-off full load into odoo_partner_stage
    --allow-first-run  permit the default run when sync_state has no row yet

PREREQUISITES / ORDER OF USE:
  * customer_odoo_aliases.odoo_name must no longer be unique before the first
    full run. The unique constraint customer_odoo_aliases_odoo_name_key is
    dropped AFTER the backfill. Two Odoo partners can share a name, and with
    that constraint still in place such a pair would fail a whole insert batch.
  * --dry-run is only meaningful after the backfill: before it, no legacy row
    has an odoo_partner_id yet, so every kept partner looks new.

Required env vars (never hardcode, never printed):
    ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY
    SUPABASE_URL, SUPABASE_KEY   (service_role key — bypasses RLS for writes)
    (--count needs only the four ODOO_* vars)

Exit codes: 0 ok (or another run in progress), 1 error, 2 refused / bad setup.
"""
import argparse
import os
import socket
import sys
import xmlrpc.client
from datetime import datetime, timedelta, timezone
from supabase import create_client

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

ODOO_URL      = os.environ.get("ODOO_URL", "").rstrip("/")
ODOO_DB       = os.environ.get("ODOO_DB", "")
ODOO_USERNAME = os.environ.get("ODOO_USERNAME", "")
ODOO_API_KEY  = os.environ.get("ODOO_API_KEY", "")
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY  = os.environ.get("SUPABASE_KEY", "")

JOB_NAME = "odoo_partners_sync"   # sync_state.job_name
LOG_JOB  = "odoo_partner_sync"    # customer_sync_log.job

# ── WHICH PARTNERS ARE KEPT — change here, nowhere else ───────────────────────
# Every is_company = True partner is kept. A person (is_company = False) is kept
# only when its `type` is in this tuple. Odoo person types are: contact,
# invoice, delivery, other, private. Skipped partners are counted, not stored.
INCLUDE_PERSON_TYPES = ("contact",)
# ──────────────────────────────────────────────────────────────────────────────

KNOWN_PERSON_TYPES = ("contact", "invoice", "delivery", "other", "private")
FIELDS = ["id", "name", "is_company", "parent_id", "type", "active", "write_date"]
PAGE_SIZE = 1000                 # Odoo page size (id > last_id, order id asc)
RPC_BATCH = 500                  # rows per insert_new_odoo_partners call
STAGE_BATCH = 500                # rows per odoo_partner_stage upsert
OVERLAP_MINUTES = 5              # incremental floor = last_synced_at - this
STALE_RUN_MINUTES = 60           # a 'running' log row younger than this blocks a new run
SOCKET_TIMEOUT_SECONDS = 60

supabase = None
_uid = None
_models = None


# ── helpers ───────────────────────────────────────────────────────────────────

def scrub(value):
    """Mask any secret value that might appear inside an error message."""
    text = str(value)
    for secret in (ODOO_API_KEY, SUPABASE_KEY):
        if secret and len(secret) >= 6:
            text = text.replace(secret, "***")
    return text


def err_text(e):
    return scrub(f"{type(e).__name__}: {e}")[:500]


def require_env(names):
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        print("Missing env vars: " + ", ".join(missing))
        sys.exit(2)


def connect_odoo():
    global _uid, _models
    common = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/common")
    _uid = common.authenticate(ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {})
    if not _uid:
        print("Odoo authentication failed - check ODOO_DB / ODOO_USERNAME / ODOO_API_KEY")
        sys.exit(1)
    _models = xmlrpc.client.ServerProxy(f"{ODOO_URL}/xmlrpc/2/object")


def execute(model, method, *args, **kwargs):
    """Same contract as odoo_leads_sync.execute: *args is wrapped in a list
    here, so pass the domain as a single list (domain=[], not [[]])."""
    return _models.execute_kw(ODOO_DB, _uid, ODOO_API_KEY, model, method, list(args), kwargs)


def m2o_id(v):
    """[id, 'Display Name'] -> id, or None if False/empty."""
    return v[0] if isinstance(v, (list, tuple)) and v else None


def m2o_name(v):
    """[id, 'Display Name'] -> name, or None if False/empty."""
    return v[1] if isinstance(v, (list, tuple)) and len(v) > 1 else None


def to_odoo_datetime_str(value):
    """Odoo domain filters need naive 'YYYY-MM-DD HH:MM:SS' (UTC) strings."""
    dt = value if isinstance(value, datetime) else datetime.fromisoformat(value)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def odoo_floor(last_synced_at):
    dt = last_synced_at if isinstance(last_synced_at, datetime) else datetime.fromisoformat(last_synced_at)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return to_odoo_datetime_str(dt - timedelta(minutes=OVERLAP_MINUTES))


def chunks(rows, size):
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


def as_int(value):
    """The RPC returns a bare integer; fail loudly on any other shape instead
    of silently under-reporting rows_added."""
    if isinstance(value, bool):
        raise ValueError(f"unexpected RPC result: {value!r}")
    if isinstance(value, int):
        return value
    if isinstance(value, list) and len(value) == 1 and isinstance(value[0], int):
        return value[0]
    raise ValueError(f"unexpected RPC result: {value!r}")


# ── filter + mapping ──────────────────────────────────────────────────────────

def classify(p):
    """-> (keep, skip_reason). Reason is None when kept."""
    if not (p.get("name") or "").strip():
        return False, "no_name"
    if p.get("is_company"):
        return True, None
    ptype = p.get("type") or "unknown"
    if ptype in INCLUDE_PERSON_TYPES:
        return True, None
    return False, f"person_type_{ptype}"


def map_partner(p):
    """Row for insert_new_odoo_partners. Deliberately has NO customer_id.
    `name`, not display_name, sent exactly as Odoo has it (not stripped)."""
    return {
        "odoo_name":         p["name"],
        "odoo_partner_id":   p["id"],
        "is_company":        bool(p.get("is_company")),
        "parent_partner_id": m2o_id(p.get("parent_id")),
        "parent_name":       m2o_name(p.get("parent_id")),
        "odoo_active":       bool(p.get("active")),
    }


def map_stage(p):
    return {
        "odoo_partner_id":   p["id"],
        "name":              p["name"],
        "is_company":        bool(p.get("is_company")),
        "parent_partner_id": m2o_id(p.get("parent_id")),
        "parent_name":       m2o_name(p.get("parent_id")),
        "active":            bool(p.get("active")),
    }


def new_stats():
    return {"pages": 0, "fetched": 0, "kept": 0, "skipped": {}, "newest_write_date": None}


def split_page(page, stats):
    """Applies the filter to one page, updating stats; returns the kept partners."""
    kept = []
    for p in page:
        stats["fetched"] += 1
        keep, reason = classify(p)
        if keep:
            kept.append(p)
            stats["kept"] += 1
        else:
            stats["skipped"][reason] = stats["skipped"].get(reason, 0) + 1
        wd = p.get("write_date")
        if wd and (stats["newest_write_date"] is None or wd > stats["newest_write_date"]):
            stats["newest_write_date"] = wd
    return kept


def fetch_pages(base_domain, stats):
    """Yields lists of up to PAGE_SIZE partners, keyset-paged on id."""
    last_id = 0
    while True:
        domain = list(base_domain) + [("id", ">", last_id)]
        page = execute(
            "res.partner", "search_read", domain,
            fields=FIELDS, limit=PAGE_SIZE, order="id asc",
            context={"active_test": False},   # include archived partners
        )
        if not page:
            return
        stats["pages"] += 1
        yield page
        last_id = page[-1]["id"]
        if len(page) < PAGE_SIZE:
            return


# ── Supabase: sync_state, log, RPC ────────────────────────────────────────────

def get_last_synced_at():
    res = supabase.table("sync_state").select("last_synced_at").eq("job_name", JOB_NAME).execute()
    return res.data[0]["last_synced_at"] if res.data else None


def set_last_synced_at(ts_iso, retries=3):
    import time
    for attempt in range(1, retries + 1):
        try:
            supabase.table("sync_state").upsert(
                {"job_name": JOB_NAME, "last_synced_at": ts_iso}, on_conflict="job_name"
            ).execute()
            print(f"sync_state updated: {ts_iso}")
            return True
        except Exception as e:
            print(f"WARNING: sync_state update failed (attempt {attempt}/{retries}): {err_text(e)}")
            if attempt < retries:
                time.sleep(2 ** attempt)
    print("ERROR: could not update sync_state after all retries.")
    return False


def mark_stale_runs():
    """A run that died leaves a 'running' log row behind; close it as an error
    once it is older than STALE_RUN_MINUTES. Only ever touches customer_sync_log."""
    now = datetime.now(timezone.utc)
    try:
        supabase.table("customer_sync_log").update({
            "status": "error",
            "finished_at": now.isoformat(),
            "error": "run never finished (process died or timed out)",
        }).eq("job", LOG_JOB).eq("status", "running") \
          .lt("started_at", (now - timedelta(minutes=STALE_RUN_MINUTES)).isoformat()).execute()
    except Exception as e:
        print(f"WARNING: could not close stale log rows: {err_text(e)}")


def another_run_in_progress():
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=STALE_RUN_MINUTES)).isoformat()
    res = supabase.table("customer_sync_log").select("id") \
        .eq("job", LOG_JOB).eq("status", "running").gte("started_at", cutoff).limit(1).execute()
    return bool(res.data)


def log_start(mode):
    res = supabase.table("customer_sync_log").insert(
        {"job": LOG_JOB, "status": "running", "dry_run": False, "details": {"mode": mode}}
    ).execute()
    return res.data[0]["id"]


def log_finish(log_id, status, rows_added, error, details):
    try:
        supabase.table("customer_sync_log").update({
            "status": status,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "rows_added": rows_added,
            "error": error,
            "details": details,
        }).eq("id", log_id).execute()
    except Exception as e:
        print(f"WARNING: could not write final log row {log_id}: {err_text(e)}")


def insert_batch(rows):
    """Insert-only: the RPC does ON CONFLICT (odoo_partner_id) DO NOTHING and
    never touches customer_id. Returns the number of rows actually inserted."""
    res = supabase.rpc("insert_new_odoo_partners", {"p_rows": rows}).execute()
    return as_int(res.data)


def fetch_existing_partner_ids():
    ids, start = set(), 0
    while True:
        res = supabase.table("customer_odoo_aliases").select("odoo_partner_id") \
            .order("id").range(start, start + 999).execute()
        rows = res.data or []
        ids.update(r["odoo_partner_id"] for r in rows if r.get("odoo_partner_id") is not None)
        if len(rows) < 1000:
            return ids
        start += 1000


# ── modes ─────────────────────────────────────────────────────────────────────

def run_count():
    """Read-only. Odoo only — never touches Supabase. Prints counts only."""
    def n(domain):
        return execute("res.partner", "search_count", domain, context={"active_test": False})

    company = ("is_company", "=", True)
    person = ("is_company", "=", False)
    total = n([])
    persons = n([person])
    companies = n([company])
    per_type = {t: n([person, ("type", "=", t)]) for t in KNOWN_PERSON_TYPES}
    kept_persons = n([person, ("type", "in", list(INCLUDE_PERSON_TYPES))])

    def row(label, value):
        print(f"{label:<44}{value}")

    print("res.partner counts (read-only)")
    row("total (incl. archived)", total)
    row("  active", n([("active", "=", True)]))
    row("  archived", n([("active", "=", False)]))
    row("companies", companies)
    row("  with a parent", n([company, ("parent_id", "!=", False)]))
    row("  without a parent", n([company, ("parent_id", "=", False)]))
    row("persons", persons)
    for t in KNOWN_PERSON_TYPES:
        row(f"  type = {t}", per_type[t])
    row("  other / unset type", persons - sum(per_type.values()))
    print(f"\nFilter INCLUDE_PERSON_TYPES = {INCLUDE_PERSON_TYPES}")
    row("would KEEP (companies + included persons)", companies + kept_persons)
    row("would SKIP (persons of other types)", persons - kept_persons)
    print("(partners with an empty name are also skipped at run time; not counted here)")
    return 0


def run_dry_run():
    """Incremental logic, zero writes (no stage, no RPC, no sync_state, no log)."""
    last_synced_at = get_last_synced_at()
    if last_synced_at:
        floor = odoo_floor(last_synced_at)
        base_domain = [("write_date", ">=", floor)]
        print(f"DRY RUN - incremental scope: write_date >= {floor} (last_synced_at - {OVERLAP_MINUTES} min)")
    else:
        base_domain = []
        print("DRY RUN - no sync_state row yet: scope is ALL partners (first-run scope)")

    stats, candidates = new_stats(), []
    for page in fetch_pages(base_domain, stats):
        candidates.extend(map_partner(p) for p in split_page(page, stats))

    existing = fetch_existing_partner_ids()
    new_rows = [r for r in candidates if r["odoo_partner_id"] not in existing]

    print(f"fetched: {stats['fetched']}  kept: {stats['kept']}  skipped: {stats['skipped'] or 0}")
    print(f"already in customer_odoo_aliases: {len(candidates) - len(new_rows)}")
    print(f"WOULD INSERT: {len(new_rows)}   (nothing was written)")
    for r in new_rows[:20]:
        kind = "company" if r["is_company"] else "person"
        parent = f", parent: {r['parent_name']}" if r["parent_name"] else ""
        print(f"  - {r['odoo_name']}  (partner {r['odoo_partner_id']}, {kind}{parent})")
    return 0


def execute_run(mode, allow_first_run):
    """mode: 'incremental' (hourly default) or 'stage'."""
    # Recorded BEFORE any fetching, so a partner written mid-run is re-seen next run.
    run_started_at = datetime.now(timezone.utc).isoformat()

    last_synced_at = None
    if mode == "incremental":
        last_synced_at = get_last_synced_at()
        if last_synced_at is None and not allow_first_run:
            print("REFUSED: no sync_state row for this job, so this would be a full load.\n"
                  "Run --stage and the backfill first, then run once with --allow-first-run.")
            return 2

    mark_stale_runs()
    if another_run_in_progress():
        print("Another run of this job is still marked running (< 1 h old) - exiting without doing anything.")
        return 0

    log_id = log_start(mode)
    stats, errors = new_stats(), []
    inserted = staged = 0
    base_domain = []
    if mode == "incremental" and last_synced_at:
        base_domain = [("write_date", ">=", odoo_floor(last_synced_at))]

    print(f"{JOB_NAME} - mode={mode} - started {run_started_at}")
    try:
        for page in fetch_pages(base_domain, stats):
            kept = split_page(page, stats)
            if mode == "stage":
                rows = [map_stage(p) for p in kept]
                for chunk in chunks(rows, STAGE_BATCH):
                    try:
                        # the ONLY overwrite in this script, and only in the scratch table
                        supabase.table("odoo_partner_stage").upsert(chunk, on_conflict="odoo_partner_id").execute()
                        staged += len(chunk)
                    except Exception as e:
                        errors.append(f"stage batch failed: {err_text(e)}")
            else:
                rows = [map_partner(p) for p in kept]
                for chunk in chunks(rows, RPC_BATCH):
                    try:
                        inserted += insert_batch(chunk)
                    except Exception as e:
                        errors.append(f"insert batch failed: {err_text(e)}")
    except Exception as e:
        errors.append(f"fetch failed: {err_text(e)}")

    ok = not errors
    if ok and mode == "incremental":
        if not set_last_synced_at(run_started_at):
            errors.append("sync_state update failed")
            ok = False

    details = {
        "mode": mode, "first_run": mode == "incremental" and last_synced_at is None,
        "fetched": stats["fetched"], "kept": stats["kept"], "skipped": stats["skipped"],
        "inserted": inserted, "staged": staged, "pages": stats["pages"],
        "newest_write_date": stats["newest_write_date"], "error_count": len(errors),
    }
    log_finish(log_id, "ok" if ok else "error", inserted, "; ".join(errors[:5]) or None, details)

    print(f"fetched={stats['fetched']} kept={stats['kept']} skipped={stats['skipped'] or 0} "
          f"inserted={inserted} staged={staged} errors={len(errors)}")
    for e in errors[:5]:
        print(f"ERROR: {e}")
    return 0 if ok else 1


def parse_args():
    p = argparse.ArgumentParser(description="Odoo res.partner -> customer_odoo_aliases (insert-only)")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--count", action="store_true", help="read-only counts from Odoo, nothing else")
    mode.add_argument("--stage", action="store_true", help="one-off full load into odoo_partner_stage")
    mode.add_argument("--dry-run", action="store_true", help="incremental logic, write nothing")
    p.add_argument("--allow-first-run", action="store_true",
                   help="let the default run proceed when sync_state has no row (full load via the RPC)")
    return p.parse_args()


def main():
    global supabase
    args = parse_args()
    socket.setdefaulttimeout(SOCKET_TIMEOUT_SECONDS)

    if args.count:
        require_env(["ODOO_URL", "ODOO_DB", "ODOO_USERNAME", "ODOO_API_KEY"])
        connect_odoo()
        return run_count()

    require_env(["ODOO_URL", "ODOO_DB", "ODOO_USERNAME", "ODOO_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"])
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    connect_odoo()

    if args.dry_run:
        return run_dry_run()
    return execute_run("stage" if args.stage else "incremental", args.allow_first_run)


if __name__ == "__main__":
    try:
        code = main()
    except SystemExit:
        raise
    except Exception as e:
        print(f"FATAL: {err_text(e)}")
        code = 1
    sys.exit(code)
