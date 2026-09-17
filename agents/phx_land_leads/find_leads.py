#!/usr/bin/env python3
"""Find early-stage North Phoenix land opportunities from public records.

Pipeline (all public, unauthenticated ArcGIS REST + Assessor endpoints,
confirmed live 2026-09-17):
  1. Maricopa County Assessor parcel layer -> vacant land parcels in North
     Phoenix zip codes (PUC = vacant land/residential/commercial use codes).
  2. Phoenix Zoning layer -> current zoning at the parcel's centroid.
  3. Phoenix General Plan layer -> future land-use designation at centroid.
  4. Phoenix Rezoning Cases (5yr) layer -> count of recent rezoning
     activity within a radius, as a proxy for "surrounded by rezoning
     momentum."
  5. FEMA NFHL Flood Hazard Zones -> floodplain flag at centroid.

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
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from datetime import date

MARICOPA_PARCELS = "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/MaricopaDynamicQueryService/MapServer/3/query"
PHX_ZONING = "https://maps.phoenix.gov/pub/rest/services/Public/Zoning/MapServer/0/query"
PHX_GENERAL_PLAN = "https://maps.phoenix.gov/pub/rest/services/Public/GeneralPlan/MapServer/0/query"
PHX_REZONING = "https://maps.phoenix.gov/pds/rest/services/Hosted/Rezoning_Proposed_5_Year/FeatureServer/0/query"
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
)
REZONING_RADIUS_MILES = 0.5
NEIGHBOR_ZONING_RADIUS_MILES = 0.15  # tight radius — "immediately adjacent" zoning context
MAX_PARCELS_ENRICHED = 400    # cap per-parcel GIS lookups (5 calls each) to be
                               # a good citizen on public/government servers
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


def esri_query(url, params, retries=3):
    params = {**params, "f": "json"}
    body = urllib.parse.urlencode(params).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=body, headers={
                "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except Exception:
            if attempt == retries - 1:
                return {"features": []}
            time.sleep(1.5)


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


def fetch_vacant_parcels():
    where = (
        "PHYSICAL_ZIP IN (" + ",".join(f"'{z}'" for z in NORTH_PHOENIX_ZIPS) + ")"
        " AND (" + " OR ".join(f"PUC LIKE '{p}%'" for p in VACANT_PUC_PREFIXES) + ")"
    )
    all_features = []
    offset = 0
    page_size = 1000
    while True:
        params = {
            "where": where,
            "outFields": "APN,OWNER_NAME,PHYSICAL_ADDRESS,LAND_SIZE,PUC,"
                         "LATITUDE,LONGITUDE,FCV_CUR,MAIL_ADDRESS,JURISDICTION,SALE_DATE,SALE_PRICE",
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


def score_lead(rec):
    score = 0
    reasons = []
    if rec["rezoningNearby"] >= 3:
        score += 30; reasons.append(f"{rec['rezoningNearby']} rezoning cases within {REZONING_RADIUS_MILES}mi")
    elif rec["rezoningNearby"] >= 1:
        score += 15; reasons.append(f"{rec['rezoningNearby']} rezoning case(s) nearby")
    if rec["rezoneTarget"]:
        score += 25; reasons.append(rec["rezoneTarget"]["basis"])
    if rec["floodZone"] and rec["floodZone"].startswith("A"):
        score -= 30; reasons.append(f"floodplain constraint (zone {rec['floodZone']})")
    if rec["landAcres"] and 0.15 <= rec["landAcres"] <= 5:
        score += 10; reasons.append("parcel size fits small-to-mid infill development")
    if rec["assessedValuePerAcre"] and rec["assessedValuePerAcre"] < 200000:
        score += 10; reasons.append("assessed value/acre below typical infill land pricing — possible mispricing")
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

    rec = {
        "apn": p.get("APN"),
        "address": (p.get("PHYSICAL_ADDRESS") or "").strip(),
        "ownerName": (p.get("OWNER_NAME") or "").strip(),
        "ownerMailAddress": (p.get("MAIL_ADDRESS") or "").strip(),
        "landSf": land_sf,
        "landAcres": land_acres,
        "puc": p.get("PUC"),
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
    }
    score, reasons = score_lead(rec)
    rec["score"] = score
    rec["reasons"] = reasons
    return rec


def main():
    print("Pulling vacant land parcels in North Phoenix zip codes...")
    parcels = fetch_vacant_parcels()
    print(f"  {len(parcels)} vacant-classified parcels found")

    def is_builder_inventory(p):
        owner = (p.get("OWNER_NAME") or "").upper()
        return any(kw in owner for kw in BUILDER_OWNER_KEYWORDS)

    candidates = [
        p for p in parcels
        if p.get("LATITUDE") is not None and p.get("LONGITUDE") is not None
        and MIN_LAND_SIZE_SF <= (p.get("LAND_SIZE") or 0) <= MAX_LAND_SIZE_SF
        and not is_builder_inventory(p)
    ]
    # Prioritize the infill-friendly size band (0.15-5 acres) for the
    # expensive per-parcel GIS enrichment, since that's the range this
    # thesis actually targets — cheap pre-filter before 4x network calls/parcel.
    def infill_priority(p):
        acres = (p.get("LAND_SIZE") or 0) / 43560
        return 0 if 0.15 <= acres <= 5 else 1
    candidates.sort(key=infill_priority)
    candidates = candidates[:MAX_PARCELS_ENRICHED]
    print(f"  enriching top {len(candidates)} candidates (zoning/GP/flood/rezoning lookups)...")

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

    today = date.today().isoformat()
    history_entry = {"date": today, "parcelsScanned": len(parcels), "leadsFound": len(leads)}
    existing_history = []
    if OUT_PATH.exists():
        try:
            import re
            text = OUT_PATH.read_text()
            m = re.search(r'"history"\s*:\s*(\[.*?\])\s*,?\s*\n\};', text, re.S)
            if m:
                existing_history = json.loads(m.group(1))
        except Exception:
            existing_history = []
    history = [h for h in existing_history if h.get("date") != today] + [history_entry]
    history = history[-52:]

    payload = {
        "updated": today,
        "market": "North Phoenix",
        "zipCodes": NORTH_PHOENIX_ZIPS,
        "parcelsScanned": len(parcels),
        "leads": leads[:300],
        "history": history,
        "methodologyNote": (
            "Public-records only: Maricopa Assessor parcels, Phoenix zoning + "
            "General Plan + rezoning-case layers, FEMA flood zones. No asking "
            "price or water/sewer availability is in any public feed found — "
            "confirm those manually per lead before underwriting."
        ),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    js = (
        "// North Phoenix Land Leads — pulled from public GIS/Assessor records\n"
        "// Regenerated by agents/phx_land_leads/find_leads.py — do not hand-edit.\n"
        "window.PHX_LAND_LEADS = " + json.dumps(payload, indent=2) + ";\n"
    )
    OUT_PATH.write_text(js)
    print(f"Wrote {len(leads[:300])} leads (of {len(leads)} scored) to {OUT_PATH}")


def _to_float(v):
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return 0.0


if __name__ == "__main__":
    sys.exit(main())
