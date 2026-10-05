#!/usr/bin/env python3
"""New-build sale values for the "Max Offer" dashboard section (sell-the-lot-to-a-builder model).
For each residential lead: median sale price of recently SOLD newly built single-family homes nearby.
The dashboard turns that into a max offer (editable assumptions live there). Standalone: `python3 offer.py`
re-attaches to the current data.js without a full pull."""
import json, re, statistics as st
from datetime import date
from pathlib import Path
from comps import _esri_query, _haversine_mi, _parse_num, _parse_sale_date, COMP_OUT_FIELDS

OFFER_LEADS = 120        # top residential leads by score
MIN_NEWBUILD_COMPS = 4
MIN_PRICE, MIN_LIVING_SF, MAX_SALE_AGE_YEARS = 250_000, 1500, 3


def new_build_values(lead):
    lat, lng = lead.get("lat"), lead.get("lng")
    if lat is None or lng is None:
        return None
    cutoff = date.today().replace(year=date.today().year - MAX_SALE_AGE_YEARS)
    for miles in (1.0, 2.0, 3.0, 5.0):
        r = _esri_query({
            "geometry": json.dumps({"x": lng, "y": lat, "spatialReference": {"wkid": 4326}}),
            "geometryType": "esriGeometryPoint", "inSR": "4326", "distance": miles * 1609.34,
            "units": "esriSRUnit_Meter", "spatialRel": "esriSpatialRelIntersects",
            "where": "SALE_PRICE IS NOT NULL AND SALE_DATE IS NOT NULL AND PUC LIKE '01%' AND CONST_YEAR >= '2019'",
            "outFields": COMP_OUT_FIELDS, "resultRecordCount": 500})
        rows, seen = [], {}
        for f in r.get("features") or []:
            c = f["attributes"]
            sold, price, sf = _parse_sale_date(c.get("SALE_DATE")), _parse_num(c.get("SALE_PRICE")), _parse_num(c.get("LIVING_SPACE"))
            if not (sold and sold >= cutoff and price >= MIN_PRICE and sf >= MIN_LIVING_SF):
                continue
            if sold.year < int(_parse_num(c.get("CONST_YEAR"))):   # a pre-construction land sale, not a home sale
                continue
            seen[(price, sold)] = seen.get((price, sold), 0) + 1
            rows.append((price, sold, sf, c))
        rows = [t for t in rows if seen[(t[0], t[1])] == 1]       # same price+date on 2+ parcels = bulk deal
        if len(rows) >= MIN_NEWBUILD_COMPS or miles == 5.0:
            break
    if len(rows) < MIN_NEWBUILD_COMPS:
        return None
    near = sorted(rows, key=lambda t: _haversine_mi(lat, lng, t[3]["LATITUDE"], t[3]["LONGITUDE"]))[:3]
    return {"arv": round(st.median(t[0] for t in rows)), "psf": round(st.median(t[0] / t[2] for t in rows)),
            "n": len(rows), "radiusMi": miles,
            "examples": [{"address": t[3]["PHYSICAL_ADDRESS"].split("  ")[0], "price": round(t[0]), "sf": round(t[2]),
                          "sold": t[1].isoformat()} for t in near]}


def attach_new_build_values(leads):
    res = [l for l in leads if l.get("landUseClass") == "residential" and not l.get("stale")]
    for l in sorted(res, key=lambda l: -l["score"])[:OFFER_LEADS]:
        l["newBuild"] = new_build_values(l)


if __name__ == "__main__":
    p = Path(__file__).resolve().parents[2] / "phx-land-leads" / "data.js"
    d = json.loads(re.search(r"= (\{.*\});", p.read_text(), re.S).group(1))
    attach_new_build_values(d["leads"])
    p.write_text("window.PHX_LAND_LEADS = " + json.dumps(d, indent=2) + ";\n")
    got = [l["newBuild"] for l in d["leads"] if l.get("newBuild")]
    print(f"attached new-build values to {len(got)} leads; median ARV ${st.median(g['arv'] for g in got):,.0f}")
