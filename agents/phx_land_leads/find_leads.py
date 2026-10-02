#!/usr/bin/env python3
"""Find early-stage North Phoenix land opportunities from public records.

Pipeline (all public, unauthenticated ArcGIS REST + Assessor endpoints,
confirmed live 2026-09-17):
  1. Maricopa County Assessor parcel layer -> two candidate pools in North
     Phoenix zip codes: (a) vacant land (PUC vacant-land/residential/
     commercial codes), and (b) "underused improved" parcels — an existing
     structure occupying a small fraction of an oversized lot (floor-area
     ratio filter), i.e. teardown/redevelopment material.
  2. Phoenix Zoning layer -> current zoning at the parcel's centroid, plus
     a distinct-values query of neighboring parcels' zoning (realistic
     rezone-target signal).
  3. Phoenix General Plan layer -> raw land-use code at centroid.
  4. Phoenix Rezoning Cases (5yr) layer -> count of recent rezoning
     activity within a radius, as a proxy for "surrounded by rezoning
     momentum."
  5. FEMA NFHL Flood Hazard Zones -> floodplain flag at centroid.

Each lead also carries a seller-motivation signal derived from the same
Assessor record: out-of-state/absentee mailing address, trust/estate/LLC
ownership, and years held (via DEED_DATE) — a public-records proxy for
"how open might this owner be to an offer," not a guarantee.

NOT included (deliberately, no fabricated numbers):
  - Asking price. No public feed carries active listing prices; get this
    from Crexi/LoopNet/broker per lead and enter it into the underwriting
    calculator on the dashboard page.
  - Water/sewer availability. Not published at parcel granularity by any
    open source found; flag as "confirm with city utilities" always.

Scoring is a simple additive point system (see score_lead) meant to RANK
candidates for a human to review, not to make the call — no lead here has
been verified for actual "for sale" status.
"""
import html
import http.client
import json
import math
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from datetime import date, datetime

from comps import _land_use_class  # same PUC-based classifier comps already uses to
                                    # match residential-to-residential / commercial-to-commercial

MARICOPA_PARCELS = "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/MaricopaDynamicQueryService/MapServer/3/query"
PHX_ZONING = "https://maps.phoenix.gov/pub/rest/services/Public/Zoning/MapServer/0/query"
PHX_GENERAL_PLAN = "https://maps.phoenix.gov/pub/rest/services/Public/GeneralPlan/MapServer/0/query"
PHX_REZONING = "https://maps.phoenix.gov/pds/rest/services/Hosted/Rezoning_Proposed_5_Year/FeatureServer/0/query"
PHX_CODE_CASES = "https://maps.phoenix.gov/pub/rest/services/Public/NSD_Property_Maintenance/MapServer/0/query"
FEMA_FLOOD = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"

# North Phoenix + nearby growth-corridor zip codes (Deer Valley, Desert Ridge,
# Anthem-adjacent, North Gateway) — adjust as the thesis expands.
NORTH_PHOENIX_ZIPS = ["85085", "85086", "85050", "85054", "85053", "85027",
                       "85024", "85023", "85032", "85028", "85022"]

# Maricopa Property Use Codes for vacant land (per AZ DOR PUC manual):
# 0001-0006 vacant undetermined, 0011-0016 vacant residential,
# 0021-0027 vacant commercial/industrial.
VACANT_PUC_PREFIXES = ("000", "001", "002")

MIN_LAND_SIZE_SF = 10000      # 0.23 acre floor — excludes standard 6-7k sf
                               # platted single-family lots (not a land-assembly play)
MAX_LAND_SIZE_SF = 2_000_000  # skip huge master-planned tracts (different play)

# Homebuilder/subdivision-inventory owners — their vacant lots are platted
# future houses, not early-stage rezoning/land-assembly opportunities.
BUILDER_OWNER_KEYWORDS = (
    "TAYLOR MORRISON", "LENNAR", "D.R. HORTON", "DR HORTON", "PULTE",
    "KB HOME", "MERITAGE", "ASHTON WOODS", "TOLL BROTHERS", "MATTAMY",
    "RICHMOND AMERICAN", "WILLIAM LYON", "TRI POINTE", "CENTURY COMMUNITIES",
    "SHEA HOMES", "FULTON HOMES", "CACHET HOMES", "HOMES INC", "HOMES LLC",
    "SOUNDBUILT",
    # utilities / telecom — cell sites, substations, easements; not acquirable land plays
    "VERIZON", "AT&T", "T-MOBILE", "CROWN CASTLE", "CENTURYLINK", "COX COMM",
    "ARIZONA PUBLIC SERVICE", "SALT RIVER PROJECT", "SOUTHWEST GAS", "CITY OF PHOENIX",
    "STATE OF ARIZONA", "MARICOPA COUNTY", "WIRELESS",
)
REZONING_RADIUS_MILES = 0.5
NEIGHBOR_ZONING_RADIUS_MILES = 0.15  # tight radius — "immediately adjacent" zoning context
MAX_PARCELS_ENRICHED = 50000  # effectively unlimited -- full coverage every run.
                               # ~1.15s/parcel single-threaded, so full North
                               # Phoenix backlog (~9k parcels) runs in ~20min at
                               # ENRICH_WORKERS concurrency -- no rate-limit risk,
                               # same peak load as before, just longer duration.
ENRICH_WORKERS = 8
OUT_PATH = Path(__file__).resolve().parents[2] / "phx-land-leads" / "data.js"

RESIDENTIAL_DENSITY_BY_ZONE = {
    # units/acre by-right, rough Phoenix zoning-code midpoints — used only
    # for "current zoning" buildable estimate, not the rezone-target case.
    "R1-6": 6, "R1-8": 5, "R1-10": 4, "R1-14": 3, "R1-18": 2, "R1-43": 1,
    "R-2": 12, "R-3": 16, "R-3A": 21, "R-4": 25, "R-5": 43,
    "RE-24": 1, "RE-35": 1, "RE-43": 1,
}
COMMERCIAL_ZONES = {"C-1", "C-2", "C-3", "PSC", "PCD"}
SINGLE_FAMILY_ZONES = {"R1-6", "R1-8", "R1-10", "R1-14", "R1-18", "R1-43",
                        "RE-24", "RE-35", "RE-43"}

OWNERSHIP_ENTITY_KEYWORDS = ("TRUST", "ESTATE OF", "LLC", "LIVING TRUST")
# Corporate suffixes checked as whole words (regex boundary) so e.g. "LINCOLN"
# doesn't false-positive on "INC". Used alongside OWNERSHIP_ENTITY_KEYWORDS to
# flag owners that are companies/government, not traceable people.
OWNERSHIP_CORPORATE_WORDS = ("INC", "INCORPORATED", "CORP", "CORPORATION", "CO",
                             "COMPANY", "LP", "LLP", "L L C", "L P",
                             "ASSOCIATION", "ASSOC", "FOUNDATION", "CHURCH",
                             "CITY OF", "COUNTY OF", "STATE OF", "CREDIT UNION",
                             "BANK", "N A")

# Reference-only lot-development cost benchmark for Phoenix-metro/Maricopa
# horizontal development (grading, roads, utility connections, impact
# fees). No single verified local deal to anchor this to (unlike the old
# Highpointe North/Raider Pointe, SD figures it replaces) -- built from
# published general-market ranges: site grading/prep $20k-$80k/lot +
# utility connections $10k-$40k/lot, general subdivision-lot benchmarks
# $25k-$140k. $65k is the rough midpoint. Shown as a labeled starting
# reference in the calculator, not a real AZ civil bid -- get one.
REFERENCE_COST_PER_LOT_AZ = 65000

# "Underused improved" parcels: an existing (non-vacant) structure sitting
# on a lot much larger than the structure needs — classic teardown/
# redevelopment material, especially when adjacent zoning is already
# denser. Detected via floor-area ratio (structure sf / lot sf), since
# Maricopa's data has no separate land-vs-improvement value split to use
# instead. Confirmed live 2026-09-17 e.g. 12608 N 24th St: 850sf house on
# a 16,993sf lot (FAR 0.05), held in a living trust since 1955-era build.
MIN_IMPROVED_LAND_SIZE_SF = 14000   # ~0.32 acre — meaningfully oversized vs
                                     # a standard 6-8k sf platted lot
MAX_UNDERUSE_FAR = 0.14             # structure occupies <14% of the lot
MAX_IMPROVED_ENRICHED = 50000        # effectively unlimited, see MAX_PARCELS_ENRICHED
COMPS_MAX_LEADS = 300               # comp a pool 2x the shown size (per category); comps then decide who makes the top 150
HOT_SCORE = 80                    # leads that ever hit this score are kept permanently
LEADS_SHOWN_PER_CATEGORY = 150       # top vacant + top improved shown, kept separate
                                      # so one category can't crowd out the other
                                     # (bounds daily load on the county's public GIS)

# Flat demolition-cost placeholders for the calculator (improved parcels
# only) — generic, not sourced from a real AZ demo bid. Editable per lead.
DEFAULT_DEMO_COST_RESIDENTIAL = 18000
DEFAULT_DEMO_COST_COMMERCIAL = 45000


_thread_local = threading.local()  # one keep-alive HTTPSConnection per (thread, host)


def _get_conn(host):
    conns = getattr(_thread_local, "conns", None)
    if conns is None:
        conns = _thread_local.conns = {}
    conn = conns.get(host)
    if conn is None:
        conn = conns[host] = http.client.HTTPSConnection(host, timeout=30)
    return conn


def esri_query(url, params, retries=3):
    params = {**params, "f": "json"}
    body = urllib.parse.urlencode(params).encode()
    parsed = urllib.parse.urlsplit(url)
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    for attempt in range(retries):
        conn = _get_conn(parsed.netloc)
        try:
            conn.request("POST", parsed.path, body=body, headers=headers)
            data = conn.getresponse().read()
            return json.loads(data)
        except Exception:
            conn.close()
            _thread_local.conns.pop(parsed.netloc, None)
            if attempt == retries - 1:
                return {"features": []}
            time.sleep(1.5)


# A trust name (e.g. "JILL PREECE BLEVINS FAMILY TRUST") usually already
# carries the real person's name -- no lookup needed. An LLC/corp name does
# not. The Arizona Corporation Commission's own search (the authoritative
# source for registered-agent names) now gates every query behind a CAPTCHA,
# which can't be scripted -- OpenCorporates mirrors the same state filings
# (registered agent name + address) on plain server-rendered pages with no
# CAPTCHA or login wall, so that's the free source used here instead.
REGISTERED_ENTITY_RE = re.compile(r"\b(LLC|L\.?L\.?C\.?|INC|CORP|CO|LP|LLP)\b")
OPENCORP_HOST = "opencorporates.com"


def _http_get(host, path, retries=3):
    for attempt in range(retries):
        conn = _get_conn(host)
        try:
            conn.request("GET", path, headers={"User-Agent": "Mozilla/5.0"})
            resp = conn.getresponse()
            data = resp.read()
            if resp.status != 200:
                return None
            return data.decode("utf-8", errors="replace")
        except Exception:
            conn.close()
            _thread_local.conns.pop(host, None)
            if attempt == retries - 1:
                return None
            time.sleep(1.0)


def lookup_registered_agent(owner_name):
    """Look up an Arizona LLC/corp's registered agent (name + address) on
    OpenCorporates, as a free stand-in for the now-CAPTCHA-gated AZ
    Corporation Commission search. Returns None for non-entity names, trusts,
    or on any lookup failure -- this is a best-effort enrichment, not a
    required field."""
    name = (owner_name or "").strip()
    if not name or not REGISTERED_ENTITY_RE.search(name.upper()):
        return None

    search_path = f"/companies/us_az?q={urllib.parse.quote(name)}"
    search_html = _http_get(OPENCORP_HOST, search_path)
    if not search_html:
        return None

    candidates = re.findall(r'/companies/us_az/([A-Za-z0-9]+)"[^>]*>([^<]+)</a>', search_html)
    if not candidates:
        return None

    target = re.sub(r"[^A-Z0-9]", "", name.upper())
    best = None
    for company_id, raw_label in candidates:
        label = html.unescape(raw_label)
        if re.sub(r"[^A-Z0-9]", "", label.upper()) == target:
            best = company_id
            break
    if not best:
        best = candidates[0][0]  # fall back to the top search hit

    detail_html = _http_get(OPENCORP_HOST, f"/companies/us_az/{best}")
    if not detail_html:
        return None

    m = re.search(r"content='([^']*)' name='description'", detail_html)
    if not m:
        return None
    desc = html.unescape(m.group(1))
    # Format: "... company BUTTERS, LLC (company number L18077184), % AGENT NAME, ADDRESS"
    tail = desc.split("),", 1)
    if len(tail) < 2:
        return None
    agent_line = tail[1].strip().lstrip("%").strip()
    if not agent_line:
        return None
    return {"source": "OpenCorporates (AZ filing mirror)", "agentLine": agent_line,
            "companyUrl": f"https://opencorporates.com/companies/us_az/{best}"}


def point_query(url, lat, lng, out_fields="*", extra_where=None):
    """Point-in-polygon query at a lat/lng against an Esri feature layer."""
    geometry = json.dumps({"x": lng, "y": lat, "spatialReference": {"wkid": 4326}})
    params = {
        "geometry": geometry, "geometryType": "esriGeometryPoint",
        "inSR": "4326", "spatialRel": "esriSpatialRelIntersects",
        "outFields": out_fields, "returnGeometry": "false",
    }
    if extra_where:
        params["where"] = extra_where
    result = esri_query(url, params)
    feats = result.get("features") or []
    return feats[0]["attributes"] if feats else None


def buffer_count_query(url, lat, lng, miles):
    """Count features within a buffer (approx, using a lat/lng bounding envelope)."""
    deg = miles / 69.0  # ~69 miles per degree latitude
    lng_deg = miles / (69.0 * max(math.cos(math.radians(lat)), 0.1))
    envelope = json.dumps({
        "xmin": lng - lng_deg, "ymin": lat - deg,
        "xmax": lng + lng_deg, "ymax": lat + deg,
        "spatialReference": {"wkid": 4326},
    })
    params = {
        "geometry": envelope, "geometryType": "esriGeometryEnvelope",
        "inSR": "4326", "spatialRel": "esriSpatialRelIntersects",
        "returnCountOnly": "true",
    }
    result = esri_query(url, params)
    return result.get("count", 0)


def buffer_distinct_values(url, lat, lng, miles, field, out_fields=None):
    """Distinct field values from polygons intersecting a lat/lng buffer envelope
    (approx square buffer, not a true geodesic circle — fine at this scale)."""
    deg = miles / 69.0
    lng_deg = miles / (69.0 * max(math.cos(math.radians(lat)), 0.1))
    envelope = json.dumps({
        "xmin": lng - lng_deg, "ymin": lat - deg,
        "xmax": lng + lng_deg, "ymax": lat + deg,
        "spatialReference": {"wkid": 4326},
    })
    params = {
        "geometry": envelope, "geometryType": "esriGeometryEnvelope",
        "inSR": "4326", "spatialRel": "esriSpatialRelIntersects",
        "outFields": out_fields or field, "returnGeometry": "false",
    }
    result = esri_query(url, params)
    feats = result.get("features") or []
    return [f["attributes"].get(field) for f in feats if f["attributes"].get(field)]


PARCEL_OUT_FIELDS = (
    "APN,OWNER_NAME,PHYSICAL_ADDRESS,LAND_SIZE,PUC,"
    "LATITUDE,LONGITUDE,FCV_CUR,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,"
    "PHYSICAL_CITY,JURISDICTION,SALE_DATE,SALE_PRICE,DEED_DATE,"
    "LIVING_SPACE,CONST_YEAR"
)


def fetch_parcels(where):
    all_features = []
    offset = 0
    page_size = 1000
    while True:
        params = {
            "where": where,
            "outFields": PARCEL_OUT_FIELDS,
            "resultOffset": offset, "resultRecordCount": page_size,
        }
        result = esri_query(MARICOPA_PARCELS, params)
        feats = result.get("features") or []
        if not feats:
            break
        all_features.extend(feats)
        if len(feats) < page_size:
            break
        offset += page_size
    return [f["attributes"] for f in all_features]


def fetch_vacant_parcels():
    where = (
        "PHYSICAL_ZIP IN (" + ",".join(f"'{z}'" for z in NORTH_PHOENIX_ZIPS) + ")"
        " AND (" + " OR ".join(f"PUC LIKE '{p}%'" for p in VACANT_PUC_PREFIXES) + ")"
    )
    return fetch_parcels(where)


def fetch_underused_improved_parcels():
    """Non-vacant parcels on lots much larger than their structure needs —
    the FAR filter (structure sf / lot sf) is applied client-side below
    since LIVING_SPACE is a formatted string, not directly comparable in
    an Esri WHERE clause.

    Restricted to PUC '01%' (single-family residential codes) only. Found
    live 2026-09-17: multi-unit/apartment PUC codes (e.g. 0733) record the
    ENTIRE COMPLEX's land size on every individual unit record, which makes
    a per-record FAR calc meaningless (produced fake near-zero FAR "leads"
    that were actually fully-built apartment complexes). Single-family
    codes don't share parcels this way — each has its own land size —
    so they're the only PUC family safe for this heuristic today.
    Commercial-teardown detection is deliberately out of scope for now
    until commercial PUC codes are vetted the same way."""
    where = (
        "PHYSICAL_ZIP IN (" + ",".join(f"'{z}'" for z in NORTH_PHOENIX_ZIPS) + ")"
        f" AND LAND_SIZE >= {MIN_IMPROVED_LAND_SIZE_SF} AND LAND_SIZE <= {MAX_LAND_SIZE_SF}"
        " AND LIVING_SPACE IS NOT NULL AND PUC LIKE '01%'"
    )
    parcels = fetch_parcels(where)
    candidates = []
    for p in parcels:
        living_sf = _to_float(p.get("LIVING_SPACE"))
        land_sf = p.get("LAND_SIZE") or 0
        if living_sf <= 0 or land_sf <= 0:
            continue
        far = living_sf / land_sf
        if far <= MAX_UNDERUSE_FAR:
            p["_farRatio"] = far
            p["_livingSpaceSf"] = living_sf
            candidates.append(p)
    return candidates


def estimate_byright_units(zoning_code, land_acres):
    if not zoning_code:
        return None
    z = zoning_code.strip().upper()
    density = RESIDENTIAL_DENSITY_BY_ZONE.get(z)
    if density is None:
        return None
    return round(density * land_acres, 1)


def estimate_rezone_target(current_zoning, surrounding_zones):
    """Realistic rezone-target heuristic: if parcels within ~0.15mi already
    carry a denser residential zone (or a commercial zone) than the subject
    parcel, flag that as the plausible rezone target. This is a judgment
    heuristic based on adjacent precedent, not a guarantee the city would
    approve it. (General Plan designation is reported for context elsewhere
    but not used here — the city's numeric GP code has no published
    code->label legend to compare against zoning meaningfully.)"""
    candidates = [z for z in surrounding_zones if z]
    best_density, best_zone = 0, None
    for z in candidates:
        d = RESIDENTIAL_DENSITY_BY_ZONE.get(z.strip().upper())
        if d and d > best_density:
            best_density, best_zone = d, z.strip().upper()
        if z.strip().upper() in COMMERCIAL_ZONES:
            best_zone = best_zone or z.strip().upper()
    current_density = RESIDENTIAL_DENSITY_BY_ZONE.get((current_zoning or "").strip().upper(), 0)
    if best_zone and best_density > current_density:
        return {"targetZone": best_zone, "targetDensity": best_density,
                "basis": f"adjacent parcels already zoned {best_zone}"}
    return None


def _street_part(addr, city):
    """Strip an address down to its street segment (everything before the city),
    normalized, so a situs address and a differently-formatted mailing address
    can be compared for a match."""
    addr = re.sub(r"\s+", " ", (addr or "").upper()).strip()
    city = (city or "").upper().strip()
    if city and city in addr:
        return addr.split(city)[0].strip()
    return addr


DISTRESS_NOTE_WORDS = ("VACANT", "BOARDED", "UNSECURED", "ABANDON", "DILAPIDAT")
SEVERE_STATUS_WORDS = ("ABATEMENT", "NOTICE OF VIOLATION", "ABATED BY CITY", "TICKET ISSUED", "VACANT UNIT")
_code_cases = {}


def load_code_cases():
    """Bulk-pull Phoenix NSD complaint cases (~31k, 2024+) once, indexed by street address."""
    offset = 0
    while True:
        feats = esri_query(PHX_CODE_CASES, {
            "where": "1=1", "outFields": "CSM_ADDRESS,CSM_STATUS,NOTES,ESRI_OID", "orderByFields": "ESRI_OID",  # service 400s without the OID field
            "resultOffset": offset, "resultRecordCount": 1000,
        }).get("features") or []
        for f in feats:
            a = f["attributes"]
            key = _street_part(a.get("CSM_ADDRESS"), "PHOENIX")
            if not key:
                continue
            c = _code_cases.setdefault(key, {"count": 0, "severe": False, "distress": False})
            text = ((a.get("CSM_STATUS") or "") + " " + (a.get("NOTES") or "")).upper()
            c["count"] += 1
            c["severe"] |= any(w in (a.get("CSM_STATUS") or "").upper() for w in SEVERE_STATUS_WORDS)
            c["distress"] |= any(w in text for w in DISTRESS_NOTE_WORDS)
        if len(feats) < 1000:
            break
        offset += 1000
    print(f"  loaded code-violation cases for {len(_code_cases)} addresses")


def analyze_ownership(p):
    owner = (p.get("OWNER_NAME") or "").upper()
    mail_city = (p.get("MAIL_CITY") or "").upper().strip()
    mail_state = (p.get("MAIL_STATE") or "").upper().strip()
    phys_city = (p.get("PHYSICAL_CITY") or "").upper().strip()
    deed_ms = p.get("DEED_DATE")

    years_held = None
    if deed_ms:
        try:
            years_held = round((time.time() * 1000 - deed_ms) / (1000 * 60 * 60 * 24 * 365.25), 1)
        except Exception:
            years_held = None

    is_entity_owner = (
        any(kw in owner for kw in OWNERSHIP_ENTITY_KEYWORDS)
        or any(re.search(rf"\b{re.escape(w)}\b", owner) for w in OWNERSHIP_CORPORATE_WORDS)
    )
    is_owner_occupied = bool(
        _street_part(p.get("MAIL_ADDRESS"), mail_city)
        and _street_part(p.get("MAIL_ADDRESS"), mail_city) == _street_part(p.get("PHYSICAL_ADDRESS"), phys_city)
    )

    return {
        "isOutOfStateOwner": bool(mail_state and mail_state != "AZ"),
        "isAbsenteeLocal": bool(mail_state == "AZ" and mail_city and phys_city and mail_city != phys_city),
        "isEntityOwner": is_entity_owner,
        # A trust/LLC whose mailing address IS the property address isn't a hidden
        # shell — it's a family's own estate-planning wrapper around their house.
        # Only flag it as needing real ownership unmasking when it's NOT owner-occupied.
        "isOwnerOccupied": is_owner_occupied,
        "isHiddenOwner": bool(is_entity_owner and not is_owner_occupied),
        "isEstateOwner": "ESTATE OF" in owner,
        "yearsHeld": years_held,
    }


def apply_comps_adjustment(leads):
    """Score bonus by equity-margin RANK within the pool (assessed values run far below
    market, so absolute margins are all high and don't separate leads): top quarter +20,
    next +10, next +4, bottom 0; margin <= 0 is -10. Idempotent via the compsAdj field."""
    for l in leads:
        old = l.pop("compsAdj", 0)
        l["score"] -= old
        l["reasons"] = [r for r in l["reasons"] if not r.startswith(("comps value", "comps margin"))]
    pool = sorted((l for l in leads if l.get("equityMarginPct") is not None), key=lambda l: l["equityMarginPct"], reverse=True)
    for i, l in enumerate(pool):
        m = l["equityMarginPct"]
        adj = -10 if m <= 0 else 20 if i < len(pool) * .25 else 10 if i < len(pool) * .5 else 4 if i < len(pool) * .75 else 0
        l["compsAdj"] = adj
        l["score"] += adj
        if m > 300:
            l["reasons"].append(f"comps margin {m}% looks extreme — verify assessed value/comps before trusting")
        if adj:
            l["reasons"].append(f"comps value ~{m:+d}% vs assessed, rank {i+1}/{len(pool)} ({adj:+d} pts)")


def score_lead(rec):
    """Additive score, roughly 0-100+. Two families of signal:
    - Development upside (does the zoning/rezoning context suggest value creation)
    - Seller motivation (does the ownership pattern suggest an easier acquisition)
    Recalibrated 2026-09 after the first live run showed real scores clustering
    10-45 — weights raised so a lead with several strong signals can clear 60+."""
    score = 0
    reasons = []

    # Development upside
    if rec["rezoningNearby"] >= 3:
        score += 25; reasons.append(f"{rec['rezoningNearby']} rezoning cases within {REZONING_RADIUS_MILES}mi")
    elif rec["rezoningNearby"] >= 1:
        score += 12; reasons.append(f"{rec['rezoningNearby']} rezoning case(s) nearby")
    if rec["rezoneTarget"]:
        score += 20; reasons.append(rec["rezoneTarget"]["basis"])
    if rec["floodZone"] and rec["floodZone"].startswith("A"):
        score -= 35; reasons.append(f"floodplain constraint (zone {rec['floodZone']})")
    if rec["landAcres"] and 0.15 <= rec["landAcres"] <= 5:
        score += 8; reasons.append("parcel size fits small-to-mid infill development")
    if rec["assessedValuePerAcre"] and rec["assessedValuePerAcre"] < 200000:
        score += 8; reasons.append("assessed value/acre below typical infill land pricing — possible mispricing")

    # Seller motivation (pure public-records inference, not a guarantee)
    own = rec["ownership"]
    if own["isOutOfStateOwner"]:
        score += 15; reasons.append("owner's mailing address is out of state (absentee)")
    elif own["isAbsenteeLocal"]:
        score += 8; reasons.append("owner's mailing address differs from the property city")
    if own["isEntityOwner"]:
        score += 10; reasons.append("held in a trust/estate/LLC — often more open to an offer")
    if own["yearsHeld"] is not None and own["yearsHeld"] >= 15:
        score += 12; reasons.append(f"held {own['yearsHeld']:.0f}+ years — likely low or no debt on the land")
    elif own["yearsHeld"] is not None and own["yearsHeld"] >= 8:
        score += 6; reasons.append(f"held {own['yearsHeld']:.0f} years")

    # Distress signals from public records (apply to vacant and improved alike)
    cc = rec.get("codeCases")
    if cc:
        if cc["distress"]:
            score += 15; reasons.append("code complaint mentions vacant/boarded/unsecured/abandoned/dilapidated")
        if cc["severe"]:
            score += 8; reasons.append("city issued a violation notice, ticket, or abatement here")
        if cc["count"] >= 2:
            score += 6; reasons.append(f"{cc['count']} code-enforcement cases at this address (2024+)")
    if own.get("isEstateOwner"):
        score += 15; reasons.append("owned by an estate — heirs are often motivated sellers")

    # Underused improved parcel (existing structure occupies little of a large lot)
    if rec["parcelStatus"] == "improved" and rec.get("farRatio") is not None:
        pct = rec["farRatio"] * 100
        score += 10
        reasons.append(f"existing structure occupies only {pct:.0f}% of the lot — under-improved for the land size")
        # Condition is NOT in public data. Proxy it: recent sale = likely renovated/flip
        # (anti-signal); old house + long hold = likely dated, deferred maintenance.
        try:
            yrs_since_sale = (date.today() - datetime.strptime(rec["saleDate"], "%m/%d/%Y").date()).days / 365.25
        except (TypeError, ValueError):
            yrs_since_sale = None
        built = int(rec["yearBuilt"]) if (rec.get("yearBuilt") or "").isdigit() else None
        if yrs_since_sale is not None and yrs_since_sale <= 5:
            score -= 20; reasons.append(f"sold {yrs_since_sale:.0f}y ago — likely renovated/flipped, probably not a teardown")
        elif built and built <= 1975 and (yrs_since_sale is None or yrs_since_sale >= 15):
            score += 15; reasons.append(f"built {built}, no sale in 15+ years — likely dated/deferred maintenance")
        elif built and built <= 1975:
            score += 6; reasons.append(f"built {built} — older housing stock")

    return score, reasons


def enrich_parcel(p):
    lat, lng = p.get("LATITUDE"), p.get("LONGITUDE")
    land_sf = p.get("LAND_SIZE") or 0

    zoning_rec = point_query(PHX_ZONING, lat, lng, "ZONING,ZCASE,DATE_APPRO")
    gp_rec = point_query(PHX_GENERAL_PLAN, lat, lng, "NEWCODE,DETAILS")
    flood_rec = point_query(FEMA_FLOOD, lat, lng, "FLD_ZONE,SFHA_TF")
    rezoning_nearby = buffer_count_query(PHX_REZONING, lat, lng, REZONING_RADIUS_MILES)
    surrounding_zones = buffer_distinct_values(PHX_ZONING, lat, lng, NEIGHBOR_ZONING_RADIUS_MILES, "ZONING")

    current_zoning = (zoning_rec or {}).get("ZONING")
    # NEWCODE is the city's numeric General Plan land-use classification —
    # the service carries no published code->label legend, so this is
    # reported as a raw code (cross-reference the city's General Plan map
    # legend to read it), not translated into a guessed label.
    gp_code = (gp_rec or {}).get("NEWCODE")
    gp_designation = f"GP code {gp_code}" if gp_code is not None else None

    land_acres = round(land_sf / 43560, 3)
    rezone_target = estimate_rezone_target(current_zoning, surrounding_zones)
    ownership = analyze_ownership(p)

    target_zone_for_type = (rezone_target or {}).get("targetZone") or current_zoning
    is_single_family_play = (target_zone_for_type or "").strip().upper() in SINGLE_FAMILY_ZONES

    is_improved = "_farRatio" in p
    living_sf = p.get("_livingSpaceSf")
    far_ratio = p.get("_farRatio")
    const_year = (p.get("CONST_YEAR") or "").strip() or None
    demo_cost = None
    if is_improved:
        is_commercial_teardown = (target_zone_for_type or "").strip().upper() in COMMERCIAL_ZONES
        demo_cost = DEFAULT_DEMO_COST_COMMERCIAL if is_commercial_teardown else DEFAULT_DEMO_COST_RESIDENTIAL

    rec = {
        "apn": p.get("APN"),
        "address": (p.get("PHYSICAL_ADDRESS") or "").strip(),
        "ownerName": (p.get("OWNER_NAME") or "").strip(),
        "ownerMailAddress": (p.get("MAIL_ADDRESS") or "").strip(),
        "ownership": ownership,
        "landSf": land_sf,
        "landAcres": land_acres,
        "puc": p.get("PUC"),
        "landUseClass": _land_use_class(p.get("PUC")),
        "lat": lat, "lng": lng,
        "assessedValue": _to_float(p.get("FCV_CUR")),
        "assessedValuePerAcre": round(_to_float(p.get("FCV_CUR")) / land_acres, 0) if land_acres else None,
        "currentZoning": current_zoning,
        "generalPlanDesignation": gp_designation,
        "floodZone": (flood_rec or {}).get("FLD_ZONE"),
        "inFloodplain": bool((flood_rec or {}).get("SFHA_TF") == "T"),
        "rezoningNearby": rezoning_nearby,
        "rezoneTarget": rezone_target,
        "byRightUnits": estimate_byright_units(current_zoning, land_acres),
        "rezoneTargetUnits": (
            round(rezone_target["targetDensity"] * land_acres, 1)
            if rezone_target and rezone_target.get("targetDensity") else None
        ),
        "dealType": "subdivision" if is_single_family_play else "rental",
        "referenceCostPerLotAZ": REFERENCE_COST_PER_LOT_AZ if is_single_family_play else None,
        "parcelStatus": "improved" if is_improved else "vacant",
        "livingSpaceSf": living_sf,
        "farRatio": far_ratio,
        "yearBuilt": const_year,
        "codeCases": _code_cases.get(_street_part(p.get("PHYSICAL_ADDRESS"), p.get("PHYSICAL_CITY"))),
        "saleDate": p.get("SALE_DATE"),
        "salePrice": _to_float(p.get("SALE_PRICE")) or None,
        "defaultDemoCost": demo_cost,
    }
    score, reasons = score_lead(rec)
    rec["score"] = score
    rec["reasons"] = reasons
    return rec


def main():
    load_code_cases()
    print("Pulling vacant land parcels in North Phoenix zip codes...")
    vacant_parcels = fetch_vacant_parcels()
    print(f"  {len(vacant_parcels)} vacant-classified parcels found")

    print("Pulling underused improved parcels (small structure, large lot)...")
    improved_parcels = fetch_underused_improved_parcels()
    print(f"  {len(improved_parcels)} underused-improved candidates found (FAR <= {MAX_UNDERUSE_FAR})")
    if not vacant_parcels and not improved_parcels:
        sys.exit("GIS returned 0 parcels (likely network/outage) — keeping existing data.js")

    def is_builder_inventory(p):
        owner = (p.get("OWNER_NAME") or "").upper()
        return any(kw in owner for kw in BUILDER_OWNER_KEYWORDS)

    vacant_candidates = [
        p for p in vacant_parcels
        if p.get("LATITUDE") is not None and p.get("LONGITUDE") is not None
        and MIN_LAND_SIZE_SF <= (p.get("LAND_SIZE") or 0) <= MAX_LAND_SIZE_SF
        and not is_builder_inventory(p)
    ]
    # Prioritize the infill-friendly size band (0.15-5 acres) for the
    # expensive per-parcel GIS enrichment, since that's the range this
    # thesis actually targets — cheap pre-filter before network calls/parcel.
    def infill_priority(p):
        acres = (p.get("LAND_SIZE") or 0) / 43560
        return 0 if 0.15 <= acres <= 5 else 1
    vacant_candidates.sort(key=infill_priority)
    vacant_candidates = vacant_candidates[:MAX_PARCELS_ENRICHED]

    improved_candidates = [
        p for p in improved_parcels
        if p.get("LATITUDE") is not None and p.get("LONGITUDE") is not None
        and not is_builder_inventory(p)
    ]
    improved_candidates.sort(key=lambda p: p["_farRatio"])  # lowest FAR (most underused) first
    improved_candidates = improved_candidates[:MAX_IMPROVED_ENRICHED]

    candidates = vacant_candidates + improved_candidates
    print(f"  enriching {len(vacant_candidates)} vacant + {len(improved_candidates)} improved "
          f"= {len(candidates)} candidates (zoning/GP/flood/rezoning lookups)...")

    leads = []
    with ThreadPoolExecutor(max_workers=ENRICH_WORKERS) as pool:
        futures = {pool.submit(enrich_parcel, p): p for p in candidates}
        for i, fut in enumerate(as_completed(futures)):
            try:
                leads.append(fut.result())
            except Exception as e:
                print(f"  skipped one parcel due to error: {e}")
            if (i + 1) % 50 == 0:
                print(f"  enriched {i+1}/{len(candidates)}...")

    leads.sort(key=lambda r: r["score"], reverse=True)

    # Vacant and teardown/improved leads are scored on the same scale, but
    # improved leads pick up extra points (existing-structure/FAR signals)
    # and there are ~13x more of them in the raw pool -- a single combined
    # top-N cut let teardown leads crowd out vacant land almost entirely
    # (293/300 improved on the run that surfaced this). Rank and cap each
    # category separately instead, so vacant land is always represented.
    vacant_leads = [l for l in leads if l["parcelStatus"] == "vacant"]
    improved_leads = [l for l in leads if l["parcelStatus"] == "improved"]
    top_leads = (vacant_leads[:LEADS_SHOWN_PER_CATEGORY]
                 + improved_leads[:LEADS_SHOWN_PER_CATEGORY])
    top_leads.sort(key=lambda r: r["score"], reverse=True)

    from comps import build_comps_for_lead
    comp_targets = (vacant_leads[:COMPS_MAX_LEADS] + improved_leads[:COMPS_MAX_LEADS])
    print(f"Pulling comparable sales for the top {len(comp_targets)} leads...")
    with ThreadPoolExecutor(max_workers=ENRICH_WORKERS) as pool:
        futures = {pool.submit(build_comps_for_lead, lead): lead for lead in comp_targets}
        for i, fut in enumerate(as_completed(futures)):
            lead = futures[fut]
            try:
                result = fut.result()
            except Exception as e:
                result = {"comps": [], "valuation": None, "note": f"Comps lookup failed: {e}"}
            lead["comps"] = result["comps"]
            lead["valuation"] = result["valuation"]
            lead["compsNote"] = result["note"]
            lead["equityMarginPct"] = None
            if result["valuation"] and lead.get("assessedValue"):
                lead["equityMarginPct"] = round(
                    (result["valuation"]["mostLikelyValue"] - lead["assessedValue"])
                    / lead["assessedValue"] * 100)
            if (i + 1) % 20 == 0:
                print(f"  comped {i+1}/{len(comp_targets)}...")
    apply_comps_adjustment(comp_targets)
    # Re-rank on comps-adjusted score and cut to the shown size per category.
    by_score = lambda ls: sorted(ls, key=lambda r: r["score"], reverse=True)[:LEADS_SHOWN_PER_CATEGORY]
    top_leads = by_score([l for l in comp_targets if l["parcelStatus"] == "vacant"]) \
              + by_score([l for l in comp_targets if l["parcelStatus"] == "improved"])
    top_leads.sort(key=lambda r: r["score"], reverse=True)

    # Unmask hidden LLC owners (not trusts -- a trust name already carries the
    # real person's name) via OpenCorporates. Scoped to top_leads only (not
    # all ~9k scanned parcels) and run at low concurrency out of courtesy to
    # a free third-party service, not our own infra.
    entity_targets = [l for l in top_leads if l["ownership"]["isHiddenOwner"]]
    if entity_targets:
        print(f"Looking up registered agents for {len(entity_targets)} entity-owned leads...")
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(lookup_registered_agent, l["ownerName"]): l for l in entity_targets}
            for fut in as_completed(futures):
                lead = futures[fut]
                try:
                    lead["registeredAgent"] = fut.result()
                except Exception:
                    lead["registeredAgent"] = None

    today = date.today().isoformat()
    existing_history = []
    previous_apns = set()
    prev_leads = {}
    if OUT_PATH.exists():
        try:
            import re
            text = OUT_PATH.read_text()
            m = re.search(r'"history"\s*:\s*(\[.*?\])\s*,\s*\n\s*"methodologyNote"', text, re.S)
            if m:
                existing_history = json.loads(m.group(1))
            prev_data = json.loads(re.search(r'window\.PHX_LAND_LEADS = (\{.*\});', text, re.S).group(1))
            prev_leads = {l.get("apn"): l for l in prev_data.get("leads", [])}
            previous_apns = set(prev_leads)
        except Exception:
            existing_history, previous_apns, prev_leads = [], set(), {}

    for lead in leads:
        lead["isNew"] = lead["apn"] not in previous_apns
    new_count = sum(l["isNew"] for l in top_leads)  # shown leads only, not all ~9k scored

    # Hot leads accumulate: any prior lead scoring >= HOT_SCORE is kept (marked
    # stale) even when it drops out of today's top lists; peak score is tracked.
    seen_now = {l["apn"] for l in top_leads}
    for l in top_leads:
        old = prev_leads.get(l["apn"], {})
        l["firstSeen"] = old.get("firstSeen", today)
        l["lastSeen"] = today
        l["peakScore"] = max(l["score"], old.get("peakScore", 0))
    kept = [dict(l, isNew=False, stale=True) for a, l in prev_leads.items()
            if a not in seen_now and l.get("score", 0) >= HOT_SCORE]
    top_leads = top_leads + kept
    print(f"  carried over {len(kept)} hot leads (score >= {HOT_SCORE}) not in today's pull")

    total_parcels_scanned = len(vacant_parcels) + len(improved_parcels)
    history_entry = {"date": today, "parcelsScanned": total_parcels_scanned, "leadsFound": len(leads), "newLeads": new_count}
    history = [h for h in existing_history if h.get("date") != today] + [history_entry]
    history = history[-52:]

    payload = {
        "updated": today,
        "market": "North Phoenix",
        "zipCodes": NORTH_PHOENIX_ZIPS,
        "parcelsScanned": total_parcels_scanned,
        "newLeadsThisRun": new_count,
        "leads": top_leads,
        "history": history,
        "methodologyNote": (
            "Public-records only: Maricopa Assessor parcels (vacant land AND "
            "underused single-family-improved parcels — an existing house "
            "occupying a small share of an oversized lot, tagged UNDERUSED LOT — condition is not in public data, verify by eye), "
            "Phoenix zoning + General Plan + rezoning-case layers, FEMA flood "
            "zones, plus ownership tenure/entity-type/mailing-address signals "
            "as a seller-motivation proxy. No asking price or water/sewer "
            "availability is in any public feed found — confirm those "
            "manually per lead before underwriting. Rezone targets landing "
            "on single-family zoning use a subdivision/lot-sale calculator "
            "(add a demolition cost for underused-lot leads); targets on "
            "multifamily/commercial zoning use a rental pro forma."
        ),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    js = (
        "// North Phoenix Land Leads — pulled from public GIS/Assessor records\n"
        "// Regenerated by agents/phx_land_leads/find_leads.py — do not hand-edit.\n"
        "window.PHX_LAND_LEADS = " + json.dumps(payload, indent=2) + ";\n"
    )
    OUT_PATH.write_text(js)
    print(f"Wrote {len(top_leads)} leads ({len(vacant_leads[:LEADS_SHOWN_PER_CATEGORY])} vacant, "
          f"{len(improved_leads[:LEADS_SHOWN_PER_CATEGORY])} teardown, of {len(leads)} scored) to {OUT_PATH}")


def _to_float(v):
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0


if __name__ == "__main__":
    sys.exit(main())
