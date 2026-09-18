"""Automatic comparable-sales engine for North Phoenix land leads.

Data source: the same Maricopa Assessor parcel layer find_leads.py already
queries (MARICOPA_PARCELS). It carries a real SALE_DATE/SALE_PRICE per
parcel -- but only the MOST RECENT sale on file, not a full sale history,
and it's county Assessor data, not MLS: no beds/baths, no unit count, and
CITY_ZONING is frequently "CONTACT LOCAL JURISDICTION" (unmapped) rather
than a real code. So comps here are scored on what the county actually
publishes -- distance, land-use code (PUC) family, lot size, building size
(LIVING_SPACE) when present, zoning match when known, sale recency, and
construction year -- not the fuller MLS-style comp criteria (condition,
photos, bed/bath count) a paid provider would carry. Good enough to sanity
-check "is this asking price in the ballpark," not a substitute for an
appraisal.

No network calls happen unless build_comps_for_lead() is called.
"""
import json
import math
import re
import time
import urllib.parse
import urllib.request
from datetime import date, datetime

MARICOPA_PARCELS = "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/MaricopaDynamicQueryService/MapServer/3/query"

COMP_OUT_FIELDS = (
    "APN,PHYSICAL_ADDRESS,SALE_DATE,SALE_PRICE,LAND_SIZE,LIVING_SPACE,"
    "CONST_YEAR,PUC,CITY_ZONING,LATITUDE,LONGITUDE"
)

RADII_MI = (1.0, 2.0, 3.0)  # expand gradually until >=3 comps qualify
MAX_SALE_AGE_YEARS = 5
MIN_COMPS = 3
MAX_COMPS = 5
MIN_SIZE_RATIO_FOR_VALUATION = 0.3  # comp land size must be within ~3x of subject's to price off it
UNKNOWN_ZONING = "CONTACT LOCAL JURISDICTION"


def _esri_query(params, retries=3):
    body = urllib.parse.urlencode({**params, "f": "json"}).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(MARICOPA_PARCELS, data=body, headers={
                "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except Exception:
            if attempt == retries - 1:
                return {"features": []}
            time.sleep(1.0)


def _parse_sale_date(s):
    try:
        return datetime.strptime((s or "").strip(), "%m/%d/%Y").date()
    except ValueError:
        return None


def _parse_num(v):
    try:
        return float(re.sub(r"[^0-9.]", "", str(v)))
    except (ValueError, TypeError):
        return None


def _haversine_mi(lat1, lng1, lat2, lng2):
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _fetch_pool(lat, lng, miles):
    """Parcels with a recorded sale within `miles` of (lat, lng)."""
    params = {
        "geometry": json.dumps({"x": lng, "y": lat, "spatialReference": {"wkid": 4326}}),
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "distance": miles * 1609.34,
        "units": "esriSRUnit_Meter",
        "spatialRel": "esriSpatialRelIntersects",
        "where": "SALE_DATE IS NOT NULL AND SALE_PRICE IS NOT NULL AND SALE_PRICE <> '0'",
        "outFields": COMP_OUT_FIELDS,
        "resultRecordCount": 500,
    }
    result = _esri_query(params)
    return [f["attributes"] for f in (result.get("features") or [])]


def _score_comp(subject, cand, dist_mi, months_since_sale):
    score = 0.0

    # Distance -- 25 pts, linear falloff to 0 at 3 miles.
    score += 25 * max(0.0, 1 - dist_mi / 3.0)

    # Recency -- 25 pts, linear falloff to 0 at 5 years (60 months).
    score += 25 * max(0.0, 1 - months_since_sale / 60.0)

    # Land-use family (PUC) -- 15 pts for a 2-digit-family match, 7 for 1-digit.
    subj_puc, cand_puc = (subject.get("puc") or ""), (cand.get("PUC") or "")
    if subj_puc[:2] and subj_puc[:2] == cand_puc[:2]:
        score += 15
    elif subj_puc[:1] and subj_puc[:1] == cand_puc[:1]:
        score += 7

    # Lot size similarity -- up to 20 pts (10+10 if a building-size
    # comparison also applies, else the full 20 goes to lot size).
    subj_land_sf = subject.get("landSf")
    cand_land_sf = cand.get("LAND_SIZE")
    subj_living_sf = subject.get("livingSpaceSf")
    cand_living_sf = _parse_num(cand.get("LIVING_SPACE"))
    do_building_compare = bool(subj_living_sf) and bool(cand_living_sf)
    land_pts = 10 if do_building_compare else 20
    if subj_land_sf and cand_land_sf:
        ratio = min(subj_land_sf, cand_land_sf) / max(subj_land_sf, cand_land_sf)
        score += land_pts * ratio
    if do_building_compare:
        ratio = min(subj_living_sf, cand_living_sf) / max(subj_living_sf, cand_living_sf)
        score += 10 * ratio

    # Zoning match -- 10 pts, only when both sides have a real (mapped) code.
    subj_zoning = (subject.get("currentZoning") or "").strip().upper()
    cand_zoning = (cand.get("CITY_ZONING") or "").strip().upper()
    if (subj_zoning and cand_zoning and subj_zoning != UNKNOWN_ZONING
            and cand_zoning != UNKNOWN_ZONING and subj_zoning == cand_zoning):
        score += 10

    # Construction-year similarity -- up to 5 pts, only for improved comps.
    subj_year = _parse_num(subject.get("yearBuilt"))
    cand_year = _parse_num(cand.get("CONST_YEAR"))
    if subj_year and cand_year:
        age_gap = abs(subj_year - cand_year)
        score += 5 * max(0.0, 1 - age_gap / 40.0)

    return round(score, 1)


def _implied_value(subject, cand):
    """What the subject would be worth if it sold at this comp's rate.

    Always land-based, never building-based: every "improved" lead in this
    app is a teardown/underused-improved candidate by construction (see
    find_leads.py's fetch_underused_improved_parcels) -- its value driver is
    the land, not the existing structure that's presumably coming down. A
    $/sf-of-house valuation would price a 3.5-acre teardown parcel off a
    480 sf shack's cost per foot, which massively undervalues the land.
    Building-size still counts in _score_comp (neighborhood-tier signal),
    just not as the dollar basis."""
    price = _parse_num(cand.get("SALE_PRICE"))
    cand_land_sf = cand.get("LAND_SIZE")
    subj_land_sf = subject.get("landSf")
    if not (price and cand_land_sf and subj_land_sf):
        return None
    return price / cand_land_sf * subj_land_sf


def build_comps_for_lead(lead, today=None):
    """Returns {"comps": [...], "valuation": {...} or None, "note": str} for
    a single lead dict (in the same shape find_leads.py's enrich_parcel
    produces). Never raises -- a lookup failure just yields no comps."""
    today = today or date.today()
    lat, lng = lead.get("lat"), lead.get("lng")
    if lat is None or lng is None:
        return {"comps": [], "valuation": None, "note": "No coordinates on file for this parcel."}

    min_sale_date = today.replace(year=today.year - MAX_SALE_AGE_YEARS)
    scored, radius_used = [], RADII_MI[-1]
    for miles in RADII_MI:
        radius_used = miles
        pool = _fetch_pool(lat, lng, miles)
        scored = []
        for cand in pool:
            if cand.get("APN") == lead.get("apn"):
                continue
            sold = _parse_sale_date(cand.get("SALE_DATE"))
            if not sold or sold < min_sale_date:
                continue
            dist_mi = _haversine_mi(lat, lng, cand.get("LATITUDE"), cand.get("LONGITUDE"))
            if dist_mi > miles:
                continue
            months_since = (today - sold).days / 30.44
            score = _score_comp(lead, cand, dist_mi, months_since)
            scored.append((score, dist_mi, sold, cand))
        if len(scored) >= MIN_COMPS:
            break

    if not scored:
        return {"comps": [], "valuation": None,
                "note": f"No comparable sales found within {RADII_MI[-1]:.0f} miles in the last "
                        f"{MAX_SALE_AGE_YEARS} years -- too rural/thin a market to comp automatically."}

    scored.sort(key=lambda t: -t[0])
    top = scored[:MAX_COMPS]

    comps_out = []
    implied_values, weights = [], []
    for score, dist_mi, sold, cand in top:
        price = _parse_num(cand.get("SALE_PRICE"))
        living_sf = _parse_num(cand.get("LIVING_SPACE"))
        land_sf = cand.get("LAND_SIZE")
        per_sf = (price / living_sf) if (price and living_sf) else None
        per_acre = (price / (land_sf / 43560)) if (price and land_sf) else None
        comps_out.append({
            "apn": cand.get("APN"),
            "address": cand.get("PHYSICAL_ADDRESS"),
            "distanceMi": round(dist_mi, 2),
            "soldDate": sold.isoformat(),
            "soldPrice": price,
            "landSf": land_sf,
            "livingSpaceSf": living_sf,
            "pricePerSf": round(per_sf) if per_sf else None,
            "pricePerAcre": round(per_acre) if per_acre else None,
            "similarity": round(score),
        })
        iv = _implied_value(lead, cand)
        # Large parcels don't sell for a linear multiple of a small lot's
        # $/sf -- bulk land discounts. Only extrapolate a dollar estimate
        # from comps whose land size is within ~3x of the subject's; a
        # 0.15-acre house-lot sale can still be a fine NEIGHBORHOOD comp
        # (shown in the table) without being a valid VALUE comp for a
        # 3.5-acre teardown lot.
        if iv and land_sf and lead.get("landSf"):
            size_ratio = min(land_sf, lead["landSf"]) / max(land_sf, lead["landSf"])
            if size_ratio >= MIN_SIZE_RATIO_FOR_VALUATION:
                implied_values.append(iv)
                weights.append(max(score, 1))

    valuation = None
    if implied_values:
        weighted_avg = sum(v * w for v, w in zip(implied_values, weights)) / sum(weights)
        low, high = min(implied_values), max(implied_values)
        land_basis = "as a redevelopment/land play (existing structure ignored)" if lead.get("parcelStatus") == "improved" else "as vacant land"
        valuation = {
            "mostLikelyValue": round(weighted_avg),
            "rangeLow": round(low),
            "rangeHigh": round(high),
            "explanation": (
                f"Based on {len(top)} comparable sale{'s' if len(top) != 1 else ''} within "
                f"{radius_used:.0f} miles, valued {land_basis} and adjusted for lot size and sale "
                f"date, the subject's land is estimated at approximately ${round(weighted_avg):,} "
                f"(range ${round(low):,}-${round(high):,})."
            ),
        }

    note = ("County Assessor data only (latest recorded sale per parcel, not full sale "
            "history or MLS-grade condition/bed-bath detail) -- treat as a sanity check, "
            "not an appraisal.")
    if not valuation:
        note = ("Comparable sales below are the closest/most recent found, but none are close "
                "enough in lot size to extrapolate a dollar value from without guessing -- "
                "review them manually instead. " + note)

    return {
        "comps": comps_out,
        "valuation": valuation,
        "note": note,
    }
