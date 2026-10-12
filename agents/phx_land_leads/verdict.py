#!/usr/bin/env python3
"""Auto-underwrite: runs the dashboard's Top-Profit model (profitFor in phx-land-leads.html) on every lead that has
nearby new-build sales, and stamps l["verdict"] = Good / Maybe / Pass. Assumptions mirror the Custom Home Calculator
defaults; build cost and site work are PLACEHOLDERS until the builder gives real numbers. Standalone: `python3 verdict.py`."""
import json, math, re
from datetime import date
from pathlib import Path
from statistics import median
from comps import _esri_query, _haversine_mi, _parse_num as _pn

_parse_num = lambda x: _pn(x) or 0

A = dict(sf=3800, hard=(300, 350), soft=0.08, site=50_000, fin=0.07, sell=0.03,   # ponytail: mirrors the numbers typed into the Custom Home Calculator
         split_cost=25_000, haircut=0.8, min_lot=10_000, good=0.10, maybe=0.05)


def house_comps(l):
    """Sale price per sf from the 5 best-matching recent HOME sales (same logic as fetchHouseComps on the page)."""
    lat, lng, yr = l.get("lat"), l.get("lng"), date.today().year
    if lat is None or lng is None:
        return None
    years = " OR ".join(f"SALE_DATE LIKE '%/{y}'" for y in (yr, yr - 1, yr - 2))
    for miles in (1, 2, 3):
        r = _esri_query({
            "geometry": json.dumps({"x": lng, "y": lat, "spatialReference": {"wkid": 4326}}), "geometryType": "esriGeometryPoint",
            "inSR": "4326", "distance": miles * 1609.34, "units": "esriSRUnit_Meter", "spatialRel": "esriSpatialRelIntersects",
            "where": f"SALE_PRICE IS NOT NULL AND SALE_PRICE <> '0' AND PUC LIKE '01%' AND ({years})",
            "outFields": "SALE_DATE,SALE_PRICE,LAND_SIZE,LIVING_SPACE,CONST_YEAR,LATITUDE,LONGITUDE", "resultRecordCount": 1000})
        rows = [f["attributes"] for f in r.get("features") or []]
        rows = [a for a in rows if _parse_num(a.get("LIVING_SPACE")) >= 1500 and _parse_num(a.get("SALE_PRICE")) >= 150_000]
        if len(rows) >= 10:
            break
    sub_lot, out = l.get("landSf") or 43560, []
    for a in rows:
        sf, price, lot, built = (_parse_num(a.get(k)) for k in ("LIVING_SPACE", "SALE_PRICE", "LAND_SIZE", "CONST_YEAR"))
        sold = date(*(int(x) for x in (a["SALE_DATE"].split("/")[2], *a["SALE_DATE"].split("/")[:2])))
        d = _haversine_mi(lat, lng, a["LATITUDE"], a["LONGITUDE"])
        score = d + abs(math.log((lot or 1) / sub_lot)) * 0.7 + (yr - (built or yr - 40)) / 15 + (date.today() - sold).days / 30.4 / 18
        out.append((score, price, price / sf))
    out.sort()
    out = out[:5]
    if not out:
        return None
    return {"psf": round(median(t[2] for t in out)), "price": round(median(t[1] for t in out)), "lowPsf": round(min(t[2] for t in out)), "n": len(out), "radiusMi": miles}


def split_n(l):
    m = re.match(r"(?:R1|RE)-(\d+)", l.get("currentZoning") or "", re.I)
    min_lot = int(m.group(1)) * 1000 if m else A["min_lot"]
    return max(1, min(4, math.floor((l.get("landSf") or 0) * 0.85 / min_lot))), bool(m)


def underwrite(l):
    v = l.get("valuation") or {}
    if l.get("parcelStatus") != "vacant" or l.get("landUseClass") != "residential":
        return None   # only vacant residential lots for now; commercial and teardowns are left alone
    nb = l["houseComps"] = house_comps(l)   # sale price comes from nearby house sales, not new-build-only comps
    if not nb:
        return None
    land_ok = bool(v.get("mostLikelyValue") and not v.get("unreliable"))
    land = v["mostLikelyValue"] if land_ok else (l.get("assessedValue") or 0)
    if not land:
        return None
    demo = l.get("defaultDemoCost", 0) if l.get("parcelStatus") == "improved" else 0
    n_split, known = split_n(l)

    def run(hard):   # best of 1 home vs split, at one build cost per sf
        C = hard * A["sf"] * (1 + A["soft"]) + A["site"]
        best = None
        for n in {1, n_split}:
            finished = n * nb["psf"] * A["sf"] * (A["haircut"] if n > 1 else 1)
            cost = (n * C + land + demo + (n - 1) * A["split_cost"]) * (1 + A["fin"])
            profit = finished * (1 - A["sell"]) - cost
            if not best or profit > best["profit"]:
                best = dict(n=n, finished=finished, profit=profit, margin=profit / finished)
        return best
    cheap, best = run(A["hard"][0]), run(A["hard"][1])   # best = the pricey $350/sf case (conservative)
    risk = ((0 if land_ok else 2) + (nb["n"] < 4) + (nb.get("radiusMi", 0) >= 3) + 2 * bool(l.get("inFloodplain"))
            + ((1 if known else 2) if best["n"] > 1 else 0))
    risk = "Low" if risk <= 1 else "Medium" if risk <= 3 else "High"
    m = best["margin"]
    label = "Good" if m >= A["good"] and risk != "High" else "Maybe" if m >= A["maybe"] or cheap["margin"] >= A["good"] else "Pass"
    return dict(label=label, strategy=f"{best['n']} homes" if best["n"] > 1 else "1 custom home", land=round(land),
                finished=round(best["finished"]), profit=round(best["profit"]), marginPct=round(m * 100), marginPctAt300=round(cheap["margin"] * 100),
                profitAt300=round(cheap["profit"]), salePsf=nb["psf"], risk=risk)


if __name__ == "__main__":
    p = Path(__file__).resolve().parents[2] / "phx-land-leads" / "data.js"
    d = json.loads(re.search(r"= (\{.*\});", p.read_text(), re.S).group(1))
    for l in d["leads"]:
        l["verdict"] = underwrite(l)
    p.write_text("window.PHX_LAND_LEADS = " + json.dumps(d, indent=2) + ";\n")
    c = {}
    for l in d["leads"]:
        k = (l["verdict"] or {}).get("label", "n/a"); c[k] = c.get(k, 0) + 1
    print("verdicts:", c)
