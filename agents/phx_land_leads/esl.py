#!/usr/bin/env python3
"""Scottsdale ESL NAOS estimate per lead: map landform + DEM-derived slope -> NAOS table row/column.

Estimate only: official NAOS uses the surveyed topo and Sec. 6.1060 reductions (not modeled).
Run: python3 esl.py   (fills lead["esl"] in phx-land-leads/data.js; slope results cached by APN in esl_cache.json)
"""
import json, math, re, threading, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[1] / "phx-land-leads" / "data.js"
CACHE = HERE / "esl_cache.json"
TABLE = json.loads((HERE / "naos_table.json").read_text())
UA = "hq-land-leads/1.0"
PARCELS = "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/MaricopaDynamicQueryService/MapServer/3/query"
LANDFORMS = "https://maps.scottsdaleaz.gov/arcgis/rest/services/OpenData/MapServer/23/query"
EPQS = "https://epqs.nationalmap.gov/v1/json"
BASIS = ("estimate: DEM-derived slope + map landform; official NAOS uses the surveyed topo and "
         "Zoning Ordinance Sec. 6.1060 reductions are NOT modeled")
FT_PER_DEG = 364000.0
PACE = 0.26            # seconds between elevation requests (<= ~4/sec)
MAX_CONSECUTIVE_FAILS = 5
_last = [0.0]
_lock = threading.Lock()
WORKERS = 6            # EPQS answers in ~6 s, so overlap requests; starts are still paced to <= ~4/sec


def naos_row(slope):
    for i, r in enumerate(TABLE["rows"]):
        if r["maxSlope"] is None or slope <= r["maxSlope"]:
            return i


def naos_lookup(landform, slope):
    """-> (naosPct, minNaosPct) in percent of lot, or (None, None) if slope/landform unknown."""
    if landform not in TABLE["landforms"] or slope is None:
        return None, None
    c = TABLE["landforms"].index(landform)
    return TABLE["rows"][naos_row(slope)]["naos"][c], TABLE["minimum"][c]


def pick_landform(shares):
    """shares: {landform: area share}. -> (main, [others]) ; main = largest share."""
    ordered = sorted((k for k, v in shares.items() if v > 0), key=lambda k: -shares[k])
    return (ordered[0], ordered[1:]) if ordered else (None, [])


def esl_stats(landform, others, slope, samples, status, acres):
    """Assemble the lead["esl"] dict. Uses the box number, never the reduced minimum, for naosAcres."""
    pct, mn = naos_lookup(landform, slope)
    out = dict(inEsl=True, landform=landform, otherLandforms=others, slopePct=slope, slopeSamples=samples,
               slopeStatus=status, naosPct=pct, naosAcres=None, usableAcres=None, minNaosPct=mn, basis=BASIS)
    if pct is not None and acres:
        out["naosAcres"] = round(acres * pct / 100, 3)
        out["usableAcres"] = round(acres * (1 - pct / 100), 3)
    return out


def _get(url, params, timeout=45, post=False):
    q = urllib.parse.urlencode({**params, "f": "json"})
    # POST for ArcGIS: polygon geometry makes the GET URL long enough that the city server answers 404
    req = urllib.request.Request(url, q.encode(), headers={"User-Agent": UA}) if post else urllib.request.Request(url + "?" + q, headers={"User-Agent": UA})
    for attempt in (0, 1):                        # one retry: the USGS service throws occasional 5xx/timeouts
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.load(r)
            break
        except OSError:
            if attempt:
                raise
            time.sleep(2)
    if isinstance(d, dict) and d.get("error"):
        raise RuntimeError(str(d["error"])[:120])
    return d


def elevation_ft(lon, lat):
    with _lock:                                   # space request starts PACE apart across threads
        wait = PACE - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
    d = _get(EPQS, dict(x=f"{lon:.7f}", y=f"{lat:.7f}", units="Feet", wkid=4326, includeDate="false"))
    v = float(d["value"])
    if not math.isfinite(v) or v < -1000:      # EPQS returns -1000000 for no data
        raise ValueError("no elevation data")
    return v


def in_ring(x, y, ring):
    ins = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            ins = not ins
    return ins


def in_poly(x, y, rings):
    return sum(in_ring(x, y, r) for r in rings) % 2 == 1      # even-odd handles holes


def grid(rings, n):
    """n x n lattice over the bbox; -> (dict{(i,j):(lon,lat)} of points inside the parcel, ftx, fty spacing)."""
    xs = [p[0] for r in rings for p in r]; ys = [p[1] for r in rings for p in r]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    dx, dy = (x1 - x0) / n, (y1 - y0) / n
    pts = {}
    for i in range(n):
        for j in range(n):
            x, y = x0 + (i + .5) * dx, y0 + (j + .5) * dy
            if in_poly(x, y, rings):
                pts[(i, j)] = (x, y)
    k = math.cos(math.radians((y0 + y1) / 2))
    return pts, dx * FT_PER_DEG * k, dy * FT_PER_DEG


def mean_slope(elev, ftx, fty):
    """Average % slope over every pair of neighbouring samples: |rise| / run * 100."""
    s = []
    for (i, j), z in elev.items():
        for (di, dj, run) in ((1, 0, ftx), (0, 1, fty)):
            z2 = elev.get((i + di, j + dj))
            if z2 is not None and run > 0:
                s.append(abs(z2 - z) / run * 100)
    return sum(s) / len(s) if s else None


def landform_shares(rings, polys):
    """polys: [(landform, rings)]. Area share by a dense point grid over the parcel (estimate)."""
    pts, _, _ = grid(rings, 24)
    counts = {}
    for x, y in pts.values():
        for name, pr in polys:
            if in_poly(x, y, pr):
                counts[name] = counts.get(name, 0) + 1
                break
    tot = sum(counts.values())
    return {k: v / tot for k, v in counts.items()} if tot else {}


def measure(apn, fails):
    """Network part. -> cacheable dict. Raises on failure (callers degrade)."""
    f = _get(PARCELS, dict(where=f"APN='{apn}'", outFields="APN", returnGeometry="true", outSR=4326), post=True)["features"]
    if not f:
        raise RuntimeError("parcel polygon not found")
    rings = f[0]["geometry"]["rings"]
    lf = _get(LANDFORMS, dict(geometry=json.dumps(f[0]["geometry"]), geometryType="esriGeometryPolygon", inSR=4326,
                              spatialRel="esriSpatialRelIntersects", outFields="DESCRIPTIO", returnGeometry="true", outSR=4326), post=True)
    polys = [(x["attributes"]["DESCRIPTIO"], x["geometry"]["rings"]) for x in lf["features"]]
    if not polys:
        return dict(inEsl=False)
    shares = landform_shares(rings, polys)
    names = {n for n, _ in polys}
    # tiny slivers can intersect without any grid point landing in them: keep them as 0-share extras
    main, others = pick_landform(shares) if shares else (sorted(names)[0], sorted(names)[1:])
    others = others + sorted(names - {main} - set(others))
    out = dict(inEsl=True, landform=main, otherLandforms=others, retrieved=time.strftime("%Y-%m-%d"))
    return out, rings


def slope_for(rings, acres):
    n = 3 if acres < 0.5 else 5
    pts, ftx, fty = grid(rings, n)
    with ThreadPoolExecutor(WORKERS) as ex:       # any failed sample raises -> slope=null (no partial averages)
        elev = dict(zip(pts, ex.map(lambda p: elevation_ft(*p), pts.values())))
    if len(elev) < 2:
        raise RuntimeError("too few sample points inside parcel")
    return round(mean_slope(elev, ftx, fty), 2), len(elev)


def process(lead, cache, state):
    apn, acres = lead["apn"], lead.get("landAcres") or lead.get("landSf", 0) / 43560
    c = cache.get(apn)
    if c is None:
        if state["fails"] >= MAX_CONSECUTIVE_FAILS:
            return dict(inEsl=None, slopePct=None, slopeStatus="skipped: services failing this run, retry next run", basis=BASIS)
        try:
            m = measure(apn, state)
            if isinstance(m, dict):                       # outside ESL
                c = m
            else:
                c, rings = m
                try:
                    c["slopePct"], c["slopeSamples"] = slope_for(rings, acres)
                    c["slopeStatus"] = "ok: USGS 3DEP via EPQS"
                except Exception as e:
                    c["slopePct"], c["slopeSamples"], c["slopeStatus"] = None, 0, f"unavailable: {type(e).__name__}: {e}"[:140]
            state["fails"] = 0
        except Exception as e:
            state["fails"] += 1
            return dict(inEsl=None, slopePct=None, slopeStatus=f"unavailable: {type(e).__name__}: {e}"[:140], basis=BASIS)
        if c.get("inEsl") is False or c.get("slopePct") is not None:    # cache only real results; failures retry next run
            cache[apn] = c
            state["dirty"] = True
        if c.get("slopePct") is None and c.get("inEsl"):
            state["fails"] += 1
    if not c["inEsl"]:
        return dict(inEsl=False, basis=BASIS)
    return esl_stats(c["landform"], c.get("otherLandforms", []), c["slopePct"], c.get("slopeSamples", 0), c["slopeStatus"], acres)


def main():
    d = json.loads(re.search(r"= (\{.*\});", DATA.read_text(), re.S).group(1))
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    state = dict(fails=0, dirty=False)
    sc = [l for l in d["leads"] if l.get("jurisdiction") == "SCOTTSDALE"]
    for l in d["leads"]:
        if l.get("jurisdiction") != "SCOTTSDALE":
            l.pop("esl", None)
    with ThreadPoolExecutor(6) as ex:             # leads overlap too; the shared pacer still caps request starts at ~4/sec
        for n, (l, r) in enumerate(zip(sc, ex.map(lambda l: process(l, cache, state), sc)), 1):
            l["esl"] = r
            if n % 25 == 0:
                CACHE.write_text(json.dumps(cache, indent=1)); print(f"  esl {n} done", flush=True)
    d["naosTable"] = TABLE
    CACHE.write_text(json.dumps(cache, indent=1))
    tmp = DATA.with_suffix(".js.tmp")
    tmp.write_text("window.PHX_LAND_LEADS = " + json.dumps(d, indent=2) + ";\n")
    tmp.replace(DATA)
    st = {}
    for l in d["leads"]:
        if "esl" in l:
            k = "outside ESL" if l["esl"]["inEsl"] is False else ("unknown" if l["esl"]["inEsl"] is None else l["esl"]["slopeStatus"][:2])
            st[k] = st.get(k, 0) + 1
    print("esl:", st)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
