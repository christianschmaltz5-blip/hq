#!/usr/bin/env python3
"""Stamp residential leads with the dashboard's underwriting screen.

home_econ and supportable_land mirror the page's homeEcon/supportableLand.
Call underwrite(lead, fetch_comps=False) to recalculate stored data offline.
Build cost and site work remain placeholders until real bids are available.
"""
import argparse
import json
import math
import re
from datetime import date, datetime, timezone
from pathlib import Path
from statistics import median
from urllib.parse import urlsplit
from comps import MARICOPA_PARCELS, _esri_query, _haversine_mi, _parse_num as _pn

_parse_num = lambda x: _pn(x) or 0

A = dict(sf=3800, hard=(275, 325), soft=0.08, site=10_000, fin=0.07, sell=0.03,
         adu=dict(n=0, sf=800, hard=350, site=15_000, value=0),
         split_cost=25_000, haircut=0.8, min_lot=14_375, usable=0.85, good=0.10, maybe=0.05)

OVERRIDES = json.loads(Path(__file__).with_name("overrides.json").read_text())
COMP_SOURCE = "Maricopa County Assessor nearby home sales"
FALLBACK_SOURCE = "Maricopa County Assessor stored new-build sales"


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def validate_override(value):
    """A price needs a positive amount, named source, URL and explicit dates."""
    if not isinstance(value, dict):
        raise ValueError("Price override must include its source and dates")
    amount = value.get("landCost")
    if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not math.isfinite(amount) or amount <= 0:
        raise ValueError("Price override landCost must be a positive finite number")
    for field in ("source", "sourceUrl", "observedAt", "priceDate", "priceType"):
        if not isinstance(value.get(field), str) or not value[field].strip():
            raise ValueError(f"Price override requires {field}")
    url = urlsplit(value["sourceUrl"])
    if url.scheme not in ("https", "http") or not url.netloc:
        raise ValueError("Price override sourceUrl must be an HTTP(S) source")
    for field in ("observedAt", "priceDate"):
        try:
            parsed = date.fromisoformat(value[field])
        except ValueError as exc:
            raise ValueError(f"Price override {field} must be YYYY-MM-DD") from exc
        if parsed.isoformat() != value[field]:
            raise ValueError(f"Price override {field} must be YYYY-MM-DD")
    return dict(value)


def stamp_land_override(l, overrides=None):
    """Clear stale numeric overrides and expose any invalid source metadata."""
    entry = (OVERRIDES if overrides is None else overrides).get(l.get("apn"))
    l["landOverride"] = None
    l["landPriceOverride"] = None
    l.pop("landPriceOverrideError", None)
    if entry is not None:
        try:
            l["landPriceOverride"] = validate_override(entry)
            l["landOverride"] = l["landPriceOverride"]["landCost"]
        except ValueError as exc:
            l["landPriceOverrideError"] = str(exc)
    return l["landPriceOverride"]


def _comp_metadata(result=None, retrieved_at=None):
    result = dict(result or {})
    result.setdefault("source", COMP_SOURCE)
    result.setdefault("sourceUrl", MARICOPA_PARCELS)
    result.setdefault("retrievedAt", retrieved_at)
    result.setdefault("fellBack", False)
    result.setdefault("error", None)
    result.setdefault("fallbackReason", None)
    return result


def house_comps(l):
    """Find 5 matching home sales; use 2nd-highest $/sf, retaining failure details."""
    retrieved_at = _now()
    lat, lng, yr = l.get("lat"), l.get("lng"), date.today().year
    if lat is None or lng is None:
        return _comp_metadata({"n": 0, "error": "Parcel coordinates unavailable"}, retrieved_at)
    years = " OR ".join(f"SALE_DATE LIKE '%/{y}'" for y in (yr, yr - 1, yr - 2))
    for miles in (1, 2, 3):
        try:
            r = _esri_query({
                "geometry": json.dumps({"x": lng, "y": lat, "spatialReference": {"wkid": 4326}}), "geometryType": "esriGeometryPoint",
                "inSR": "4326", "distance": miles * 1609.34, "units": "esriSRUnit_Meter", "spatialRel": "esriSpatialRelIntersects",
                "where": f"SALE_PRICE IS NOT NULL AND SALE_PRICE <> '0' AND PUC LIKE '01%' AND ({years})",
                "outFields": "SALE_DATE,SALE_PRICE,LAND_SIZE,LIVING_SPACE,CONST_YEAR,LATITUDE,LONGITUDE,PHYSICAL_ADDRESS", "resultRecordCount": 1000})
        except Exception as exc:
            return _comp_metadata({"n": 0, "error": f"County GIS request failed: {type(exc).__name__}: {exc}", "radiusMi": miles}, retrieved_at)
        if r.get("_failed") or r.get("error"):
            error = r.get("_error") or r.get("error") or "County GIS query failed"
            if isinstance(error, dict):
                error = error.get("message") or str(error)
            print(f"house_comps: county query failed for {l.get('apn')} ({miles} mi); fallback will be marked")
            return _comp_metadata({"n": 0, "error": str(error), "radiusMi": miles}, retrieved_at)
        rows = [f["attributes"] for f in r.get("features") or []]
        rows = [a for a in rows if 0.6 * A["sf"] <= _parse_num(a.get("LIVING_SPACE")) <= 1.6 * A["sf"] and _parse_num(a.get("SALE_PRICE")) >= 150_000]   # match the planned home size
        if len(rows) >= 10:
            break
    sub_lot, out = l.get("landSf") or 43560, []
    for a in rows:
        sf, price, lot, built = (_parse_num(a.get(k)) for k in ("LIVING_SPACE", "SALE_PRICE", "LAND_SIZE", "CONST_YEAR"))
        try:
            sold = datetime.strptime(a["SALE_DATE"], "%m/%d/%Y").date()
            d = _haversine_mi(lat, lng, float(a["LATITUDE"]), float(a["LONGITUDE"]))
        except (ValueError, TypeError, KeyError):
            continue
        score = d + abs(math.log((lot or 1) / sub_lot)) * 0.7 + (yr - (built or yr - 40)) / 15 + (date.today() - sold).days / 30.4 / 18
        out.append((score, price, price / sf, (a.get("PHYSICAL_ADDRESS") or "").split("  ")[0].strip(), a["SALE_DATE"], round(sf)))
    out.sort()
    out = out[:5]
    if len(out) < 3:
        return _comp_metadata({"n": len(out), "radiusMi": miles, "fallbackReason": f"Fewer than 3 home sales of {round(0.6 * A['sf']):,}-{round(1.6 * A['sf']):,} sf nearby"}, retrieved_at)
    return _comp_metadata({"psf": round(sorted((t[2] for t in out), reverse=True)[min(1, len(out) - 1)]),
             "medPsf": round(median(t[2] for t in out)), "price": round(median(t[1] for t in out)), "lowPsf": round(min(t[2] for t in out)), "n": len(out), "radiusMi": miles,
             "comps": [{"address": t[3], "sold": t[4], "price": round(t[1]), "sf": t[5]} for t in out]}, retrieved_at)


def resolve_house_comps(l, result):
    """Keep lookup errors visible even when the stored new-build model is usable."""
    hc = _comp_metadata(result)
    if hc.get("psf"):
        return hc
    fallback = l.get("newBuild") or {}
    if not fallback.get("psf"):
        return hc
    reason = hc.get("error") or hc.get("fallbackReason") or "No stored nearby home-sales comps are available"
    return _comp_metadata({**fallback,
        "source": fallback.get("source") or FALLBACK_SOURCE,
        "sourceUrl": fallback.get("sourceUrl") or MARICOPA_PARCELS,
        "retrievedAt": fallback.get("retrievedAt"),
        "lookupAttemptedAt": hc.get("retrievedAt"),
        "fellBack": True, "error": hc.get("error"), "fallbackReason": reason})


def home_econ(x):
    """Pure per-parcel economics, using the same input names as JS homeEcon."""
    C = x["hard"] * x["sf"] * (1 + x["soft"]) + x["site"]
    n, multi = x["n"], x["n"] > 1
    a = x.get("adu") if not multi and x.get("adu") and x["adu"].get("n", 0) > 0 else None
    adu_cost = a["n"] * (a["sf"] * a["hard"] * (1 + x["soft"]) + a["site"]) if a else 0
    finished = n * x["psf"] * x["sf"] * (x["haircut"] if multi else 1) + (a["value"] if a else 0)
    cost = (n * C + x["land"] + (x.get("demo") or 0) + ((n - 1) * x["splitCost"] if multi else 0) + adu_cost) * (1 + x["fin"])
    profit = finished * (1 - x["sell"]) - cost
    return dict(C=C, finished=finished, cost=cost, profit=profit, aduCost=adu_cost, margin=profit / finished if finished else 0)


def supportable_land(x, target):
    """Signed land budget at target margin; negative means no nonnegative offer works."""
    e = home_econ(x)
    return e["finished"] * (1 - x["sell"] - target) / (1 + x["fin"]) - x["n"] * e["C"] - (x.get("demo") or 0) - (max(0, x["n"] - 1) * x["splitCost"]) - e["aduCost"]


def split_n(l):
    m = re.match(r"(?:R1|RE)-(\d+)", l.get("currentZoning") or "", re.I)
    min_lot = int(m.group(1)) * 1000 if m else A["min_lot"]
    return max(1, min(4, math.floor((l.get("landSf") or 0) * A["usable"] / min_lot))), bool(m)


def verdict_label(high_profit, high_margin, low_margin, risk):
    if high_margin >= A["good"] and risk != "High":
        return "Good"
    return "Maybe" if high_profit >= 0 and (high_margin >= A["maybe"] or low_margin >= A["good"]) else "Pass"


def underwrite(l, *, fetch_comps=True, overrides=None):
    override = stamp_land_override(l, overrides)
    if l.get("landUseClass") != "residential":
        return None
    # Offline recalculation preserves stored retrieval dates; unknown dates remain null.
    hc = l["houseComps"] = resolve_house_comps(l, house_comps(l) if fetch_comps else l.get("houseComps"))
    if not hc.get("psf"):
        return None
    v = l.get("valuation") or {}
    land_ok = bool(override or (v.get("mostLikelyValue") and not v.get("unreliable")))
    land = override["landCost"] if override else (v["mostLikelyValue"] if land_ok else (l.get("assessedValue") or 0))
    if not land:
        return None
    n_split, known = split_n(l)

    def inputs(n, hard):
        return dict(sf=A["sf"], hard=hard, soft=A["soft"], site=A["site"], fin=A["fin"], sell=A["sell"],
                    land=land, demo=(l.get("defaultDemoCost") or 0) if l.get("parcelStatus") == "improved" else 0,
                    n=n, psf=hc["psf"], haircut=A["haircut"], splitCost=A["split_cost"], adu=A["adu"] if l.get("currentZoning") else None)

    def run(hard):
        return max((dict(n=n, **home_econ(inputs(n, hard))) for n in sorted({1, n_split})), key=lambda result: result["profit"])

    cheap, best = run(A["hard"][0]), run(A["hard"][1])
    fallback = bool(hc.get("fellBack"))
    risk = ((0 if land_ok else 2) + ((hc.get("n") or 0) < (6 if fallback else 4)) + ((hc.get("radiusMi") or 0) >= 3)
            + (2 if l.get("inFloodplain") else 1 if l.get("floodKnown") is False else 0)
            + ((1 if known else 2) if best["n"] > 1 else 0)
            + (2 if hc["psf"] > 800 else 0))   # unverified: sale price above $800/sf
    risk = "Low" if risk <= 1 else "Medium" if risk <= 3 else "High"
    m = best["margin"]
    offer, offer_n = max(((supportable_land(inputs(n, A["hard"][1]), A["good"]), n)
                         for n in sorted({1, n_split})), key=lambda item: item[0])
    return dict(label=verdict_label(best["profit"], m, cheap["margin"], risk),
                strategy=f"{best['n']} homes" if best["n"] > 1 else "1 custom home", land=round(land),
                finished=round(best["finished"]), profit=round(best["profit"]), marginPct=round(m * 100), marginPctAt275=round(cheap["margin"] * 100),
                profitAt275=round(cheap["profit"]), salePsf=hc["psf"], risk=risk,
                supportableOffer=round(offer), offerHomes=offer_n, offerTargetMargin=A["good"], offerHardPsf=A["hard"][1],
                compSource=hc["source"], compSourceUrl=hc["sourceUrl"], compRetrievedAt=hc["retrievedAt"],
                compFellBack=fallback, compError=hc["error"], compFallbackReason=hc["fallbackReason"])


def recalculate_data(data, *, cached=False):
    """Recalculate in place; cached mode never requests replacement county comps."""
    for lead in data["leads"]:
        lead["verdict"] = underwrite(lead, fetch_comps=not cached)
    counts = {}
    for lead in data["leads"]:
        label = (lead["verdict"] or {}).get("label", "n/a")
        counts[label] = counts.get(label, 0) + 1
    return counts


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cached", action="store_true",
                        help="recalculate stored comps offline; preserve retrieval dates and lookup errors")
    args = parser.parse_args(argv)
    p = Path(__file__).resolve().parents[2] / "phx-land-leads" / "data.js"
    d = json.loads(re.search(r"= (\{.*\});", p.read_text(), re.S).group(1))
    counts = recalculate_data(d, cached=args.cached)
    p.write_text("window.PHX_LAND_LEADS = " + json.dumps(d, indent=2) + ";\n")
    print("verdicts (stored comps; no network):" if args.cached else "verdicts:", counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
