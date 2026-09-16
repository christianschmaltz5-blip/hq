#!/usr/bin/env python3
"""Pull City of Phoenix PDD Online issued-permit data and write hq/phx-permits/data.js.

Source: apps-secure.phoenix.gov/PDD/Search/IssuedPermit — a public, unauthenticated
JSON endpoint (no login, no anti-bot wall, unlike Crexi). Confirmed 2026-09-16 via
plain curl with no cookies. Pulls a rolling 60-day window of ALL issued permits
citywide, paginated at 500/page.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ENDPOINT = "https://apps-secure.phoenix.gov/PDD/Search/IssuedPermit/_GetIssuedPermitData"
GEOCODE_ENDPOINT = "https://nominatim.openstreetmap.org/search"
GEOCODE_USER_AGENT = "hq-phx-permits/1.0 (personal dashboard, christianschmaltz5@gmail.com)"
GEOCODE_MAX_NEW_PER_RUN = 300  # Nominatim usage policy: max 1 req/sec, be a good citizen
WINDOW_DAYS = 60
PAGE_SIZE = 500
OUT_PATH = Path(__file__).resolve().parents[2] / "phx-permits" / "data.js"
GEOCODE_CACHE_PATH = Path(__file__).resolve().parent / "geocode_cache.json"

today = date.today()
start = today - timedelta(days=WINDOW_DAYS)


def load_geocode_cache():
    if GEOCODE_CACHE_PATH.exists():
        try:
            return json.loads(GEOCODE_CACHE_PATH.read_text())
        except Exception:
            return {}
    return {}


def save_geocode_cache(cache):
    GEOCODE_CACHE_PATH.write_text(json.dumps(cache, indent=2, sort_keys=True))


def geocode(address, cache, budget):
    """Look up lat/lng for an address, using and updating the on-disk cache.
    Returns (lat, lng) or (None, None). Mutates `budget[0]` (new-lookup counter)."""
    key = address.strip().upper()
    if not key:
        return None, None
    if key in cache:
        entry = cache[key]
        return entry.get("lat"), entry.get("lng")
    if budget[0] >= GEOCODE_MAX_NEW_PER_RUN:
        return None, None

    q = urllib.parse.urlencode({
        "q": f"{address}, Phoenix, AZ",
        "format": "json",
        "limit": 1,
    })
    req = urllib.request.Request(
        f"{GEOCODE_ENDPOINT}?{q}",
        headers={"User-Agent": GEOCODE_USER_AGENT},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            results = json.load(resp)
        lat = float(results[0]["lat"]) if results else None
        lng = float(results[0]["lon"]) if results else None
    except Exception:
        lat, lng = None, None

    cache[key] = {"lat": lat, "lng": lng}
    budget[0] += 1
    time.sleep(1.1)  # Nominatim policy: max 1 request/sec
    return lat, lng


def fetch_page(page):
    body = (
        f"PermitType=&StructureClass="
        f"&StartDate={start.strftime('%m%%2F%d%%2F%Y')}"
        f"&EndDate={today.strftime('%m%%2F%d%%2F%Y')}"
        f"&sort=&page={page}&pageSize={PAGE_SIZE}&group=&filter="
    ).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def parse_valuation(v):
    if not v:
        return 0.0
    return float(re.sub(r"[^0-9.]", "", v) or 0)


def parse_date_ms(s):
    if not s:
        return None
    m = re.search(r"/Date\((\d+)\)/", s)
    return int(m.group(1)) if m else None


def main():
    first = fetch_page(1)
    total = first.get("Total", 0)
    rows = list(first.get("Data") or [])
    page = 2
    while len(rows) < total:
        batch = fetch_page(page).get("Data") or []
        if not batch:
            break
        rows.extend(batch)
        page += 1

    # Dedupe on permit Number (the grid repeats a permit once per contractor/plan line)
    by_number = {}
    for r in rows:
        num = r.get("Number")
        existing = by_number.get(num)
        if existing is None or parse_valuation(r.get("Valuation")) > parse_valuation(existing.get("Valuation")):
            by_number[num] = r

    permits = list(by_number.values())
    total_valuation = sum(parse_valuation(r.get("Valuation")) for r in permits)
    contractors = {}
    for r in permits:
        c = (r.get("Contractor") or "").strip()
        if not c:
            continue
        contractors[c] = contractors.get(c, {"count": 0, "valuation": 0.0})
        contractors[c]["count"] += 1
        contractors[c]["valuation"] += parse_valuation(r.get("Valuation"))

    contractor_book = sorted(
        [{"name": k, **v} for k, v in contractors.items()],
        key=lambda x: x["valuation"], reverse=True,
    )[:100]

    sites = sorted(
        [
            {
                "address": (r.get("Address") or "").strip(),
                "permitNumber": r.get("Number"),
                "permitType": r.get("Type"),
                "structClass": r.get("Struct_Class"),
                "status": r.get("Status"),
                "issueDateMs": parse_date_ms(r.get("Issue_Date")),
                "valuation": parse_valuation(r.get("Valuation")),
                "contractor": (r.get("Contractor") or "").strip(),
                "ownerName": (r.get("Owner_Name") or "").strip(),
                "parcel": r.get("Parcel"),
                "zoning": r.get("Zoning"),
                "units": r.get("Units"),
                "totalFees": r.get("Total_Fees"),
            }
            for r in permits
        ],
        key=lambda x: x["valuation"], reverse=True,
    )[:500]  # top 500 by valuation; full count still in totalPermits

    geocode_cache = load_geocode_cache()
    new_lookups = [0]
    for s in sites:
        lat, lng = geocode(s["address"], geocode_cache, new_lookups)
        s["lat"], s["lng"] = lat, lng
    save_geocode_cache(geocode_cache)
    geocoded_count = sum(1 for s in sites if s.get("lat") is not None)

    history_entry = {
        "date": today.isoformat(),
        "permits": len(permits),
        "totalValuation": round(total_valuation, 2),
    }

    existing_history = []
    if OUT_PATH.exists():
        try:
            text = OUT_PATH.read_text()
            m = re.search(r'"history"\s*:\s*(\[.*?\])\s*,?\s*\n\};', text, re.S)
            if m:
                existing_history = json.loads(m.group(1))
        except Exception:
            existing_history = []
    history = [h for h in existing_history if h.get("date") != history_entry["date"]] + [history_entry]
    history = history[-52:]  # keep last year of weekly-ish runs

    payload = {
        "updated": today.isoformat(),
        "windowDays": WINDOW_DAYS,
        "windowStart": start.isoformat(),
        "windowEnd": today.isoformat(),
        "totalPermits": len(permits),
        "totalValuation": round(total_valuation, 2),
        "contractorCount": len(contractors),
        "geocodedCount": geocoded_count,
        "sites": sites,
        "contractorBook": contractor_book,
        "history": history,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    js = (
        "// Phoenix Permit Tracker — pulled from City of Phoenix PDD Online (public, no auth)\n"
        "// Regenerated by agents/phx_permits/pull_permits.py — do not hand-edit.\n"
        "window.PHX_PERMITS = " + json.dumps(payload, indent=2) + ";\n"
    )
    OUT_PATH.write_text(js)
    print(f"Wrote {len(sites)} sites ({geocoded_count} geocoded, {len(permits)} total permits, "
          f"${total_valuation:,.0f}) to {OUT_PATH}")


if __name__ == "__main__":
    sys.exit(main())
