#!/usr/bin/env python3
"""New-build sale values for the "Max Offer" dashboard section (sell-the-lot-to-a-builder model).
For each residential lead: median sale price of recently SOLD newly built single-family homes nearby.
The dashboard turns that into a max offer (editable assumptions live there). Standalone: `python3 offer.py`
re-attaches to the current data.js without a full pull."""
import json, math, re, statistics as st
from datetime import date, datetime, timezone
from pathlib import Path
from comps import _esri_query, _haversine_mi, _parse_num, _parse_sale_date, COMP_OUT_FIELDS, MARICOPA_PARCELS
from house_comp_policy import HOUSE_COMP_POLICY, eligible_home_sale

OFFER_LEADS = 120        # top residential leads by score
MIN_NEWBUILD_COMPS = 4
MIN_PRICE, MAX_SALE_AGE_YEARS = 250_000, 3


def new_build_values(lead):
    lat, lng = lead.get("lat"), lead.get("lng")
    if lat is None or lng is None:
        return None
    cutoff = date.today().replace(year=date.today().year - MAX_SALE_AGE_YEARS)
    for miles in (1.0, 2.0, 3.0, 5.0):
        retrieved_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        r = _esri_query({
            "geometry": json.dumps({"x": lng, "y": lat, "spatialReference": {"wkid": 4326}}),
            "geometryType": "esriGeometryPoint", "inSR": "4326", "distance": miles * 1609.34,
            "units": "esriSRUnit_Meter", "spatialRel": "esriSpatialRelIntersects",
            "where": "SALE_PRICE IS NOT NULL AND SALE_DATE IS NOT NULL AND PUC LIKE '01%' AND CONST_YEAR >= '2019'",
            "outFields": COMP_OUT_FIELDS, "resultRecordCount": 500})
        if r.get("_failed") or r.get("error"):
            error = r.get("_error") or r.get("error") or "County GIS query failed"
            print(f"new_build_values: county query failed for {lead.get('apn')} ({miles} mi): {error}; new-build values unavailable")
            return {"error": str(error), "source": "Maricopa County Assessor nearby new-build sales", "sourceUrl": MARICOPA_PARCELS,
                    "retrievedAt": retrieved_at, "radiusMi": miles, "n": 0}
        rows, seen, seen_apns = [], {}, set()
        for f in r.get("features") or []:
            c = f["attributes"]
            sold, price, sf = _parse_sale_date(c.get("SALE_DATE")), _parse_num(c.get("SALE_PRICE")), _parse_num(c.get("LIVING_SPACE"))
            if not (sold and cutoff <= sold <= date.today() and eligible_home_sale(sf, price) and price >= MIN_PRICE):
                continue
            built = _parse_num(c.get("CONST_YEAR"))
            apn = c.get("APN")
            if not built or sold.year < built:   # a pre-construction land sale, not a home sale
                continue
            if apn and (apn == lead.get("apn") or apn in seen_apns):
                continue
            try:
                comp_lat, comp_lng = float(c["LATITUDE"]), float(c["LONGITUDE"])
                if not math.isfinite(comp_lat) or not math.isfinite(comp_lng) or not -90 <= comp_lat <= 90 or not -180 <= comp_lng <= 180:
                    continue
            except (ValueError, TypeError, KeyError):
                continue
            c = {**c, "LATITUDE": comp_lat, "LONGITUDE": comp_lng}
            if apn:
                seen_apns.add(apn)
            seen[(price, sold)] = seen.get((price, sold), 0) + 1
            rows.append((price, sold, sf, c))
        rows = [t for t in rows if seen[(t[0], t[1])] == 1]       # same price+date on 2+ parcels = bulk deal
        if len(rows) >= MIN_NEWBUILD_COMPS or miles == 5.0:
            break
    if len(rows) < MIN_NEWBUILD_COMPS:
        return None
    near = sorted(rows, key=lambda t: _haversine_mi(lat, lng, t[3]["LATITUDE"], t[3]["LONGITUDE"]))[:5]
    psfs = [t[0] / t[2] for t in rows]
    return {"arv": round(st.median(t[0] for t in rows)), "psf": round(st.median(t[0] / t[2] for t in rows)),
            "n": len(rows), "radiusMi": miles, "lowPsf": round(min(psfs)), "highPsf": round(max(psfs)),
            "source": "Maricopa County Assessor nearby new-build sales", "sourceUrl": MARICOPA_PARCELS,
            "retrievedAt": retrieved_at, "fellBack": False, "error": None, "fallbackReason": None,
            "selectionPolicy": HOUSE_COMP_POLICY["id"],
            "examples": [{"address": t[3]["PHYSICAL_ADDRESS"].split("  ")[0], "price": round(t[0]), "sf": round(t[2]), "apn": t[3].get("APN"), "yearBuilt": _parse_num(t[3].get("CONST_YEAR")),
                          "distanceMi": round(_haversine_mi(lat, lng, t[3]["LATITUDE"], t[3]["LONGITUDE"]), 3), "sold": t[1].isoformat()} for t in near]}


def attach_new_build_values(leads, limit=OFFER_LEADS):
    res = [l for l in leads if l.get("landUseClass") == "residential" and not l.get("stale")]
    for l in sorted(res, key=lambda l: -l["score"])[:limit]:
        result = new_build_values(l)
        l["newBuildLookup"] = {k: (result or {}).get(k) for k in ("source", "sourceUrl", "retrievedAt", "error")}
        l["newBuild"] = result if result and result.get("arv") and result.get("psf") else None


if __name__ == "__main__":
    p = Path(__file__).resolve().parents[2] / "phx-land-leads" / "data.js"
    d = json.loads(re.search(r"= (\{.*\});", p.read_text(), re.S).group(1))
    attach_new_build_values(d["leads"])
    p.write_text("window.PHX_LAND_LEADS = " + json.dumps(d, indent=2) + ";\n")
    got = [l["newBuild"] for l in d["leads"] if l.get("newBuild")]
    print(f"attached new-build values to {len(got)} leads; median ARV ${st.median(g['arv'] for g in got):,.0f}")
