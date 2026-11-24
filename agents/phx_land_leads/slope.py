#!/usr/bin/env python3
"""Store USGS 3DEP slope per lead in phx-land-leads/slope/<apn>.json (mirror of fetchElevation in phx-land-leads.html).

Incremental + resumable: leads that already have a file are skipped. Deterministic failures (no boundary, mostly
NoData) are stored as {failed:true, reason} and only retried with --retry-failed; network errors are NOT stored
(retried next run). Run: python3 slope.py [--retry-failed] [--workers 4] [--limit N]
"""
import argparse, json, math, os, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA, OUT = ROOT / "phx-land-leads" / "data.js", ROOT / "phx-land-leads" / "slope"
GIS_PARCELS = "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/MaricopaDynamicQueryService/MapServer/3"
USGS = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples"
FT = 3.28084


class NetError(Exception):
    pass


def ring_hash(ring):
    """FNV-1a 32-bit over 'lng,lat,lng,lat...' (6 decimals), 8 hex chars. Identical in the page."""
    h = 0x811C9DC5
    for b in ",".join(f"{c:.6f}" for p in ring for c in (p[0], p[1])).encode():
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def pip(pt, poly):
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        a, b = poly[i], poly[j]
        if (a[1] > pt[1]) != (b[1] > pt[1]) and pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]:
            c = not c
        j = i
    return c


def slope_cells(z, nx, ny, dx, dy):
    """Port of slopeCells: slope % per cell, None where no sample / no neighbour."""
    def at(i, j):
        return None if i < 0 or j < 0 or i >= nx or j >= ny else z[j * nx + i]

    def g(a, b, d):
        return (b - a) / d if a is not None and b is not None else None

    def c(v, a, b, h):
        l, r = at(*a), at(*b)
        if l is not None and r is not None:
            return (r - l) / (2 * h)
        s = g(v, r, h)
        return s if s is not None else g(l, v, h)

    out = []
    for k, v in enumerate(z):
        if v is None:
            out.append(None)
            continue
        i = k % nx
        j = (k - i) // nx
        sx, sy = c(v, (i - 1, j), (i + 1, j), dx), c(v, (i, j - 1), (i, j + 1), dy)
        out.append(None if sx is None and sy is None else math.hypot(sx or 0, sy or 0) * 100)
    return out


def grid(ring):
    """Sample grid in the page's local-meter frame -> (lng0, lat0, kx, nx, ny, dx, dy, cells)."""
    lat0 = sum(p[1] for p in ring) / len(ring)
    lng0 = sum(p[0] for p in ring) / len(ring)
    kx = 111320 * math.cos(lat0 * math.pi / 180)
    R = [[(p[0] - lng0) * kx, (p[1] - lat0) * 110540] for p in ring]
    xs, ys = [p[0] for p in R], [p[1] for p in R]
    x0, y0, w, h = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
    sp = max(5, max(w, h) / 11)
    nx, ny = min(12, int(w // sp) + 1), min(12, int(h // sp) + 1)
    dx, dy = w / nx, h / ny
    cells = []
    for j in range(ny):
        for i in range(nx):
            x, y = x0 + (i + .5) * dx, y0 + (j + .5) * dy
            cells.append({"x": x, "y": y, "inside": pip([x, y], R)})
    return lng0, lat0, kx, nx, ny, dx, dy, cells


def build(ring, v, lng0=None, lat0=None, kx=None):
    """Samples -> stored record (or None if too few inside / mostly NoData). v = list of float|None per cell."""
    _, _, _, nx, ny, dx, dy, cells = grid(ring)
    for c, z in zip(cells, v):
        c["z"] = z
    allsl = slope_cells(v, nx, ny, dx, dy)
    ins = [c for c in cells if c["inside"] and c["z"] is not None]
    if len(ins) < max(3, sum(c["inside"] for c in cells) / 2):
        return None
    sl = [s for s, c in zip(allsl, cells) if s is not None and c["inside"]]
    if not sl:
        return None
    zs = [c["z"] for c in ins]
    r2 = lambda x: None if x is None else round(x, 2)
    return {"cells": [{"x": r2(c["x"]), "y": r2(c["y"]), "inside": c["inside"], "z": r2(c["z"])} for c in cells],
            "sl": [r2(s) for s in allsl], "dx": dx, "dy": dy, "avg": sum(sl) / len(sl), "max": max(sl),
            "reliefFt": (max(zs) - min(zs)) * FT, "ringHash": ring_hash(ring), "src": "USGS 3DEP",
            "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")}


def post(url, form, tries=3):
    body = urllib.parse.urlencode(form).encode()
    for t in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, body), timeout=45) as r:
                return json.load(r)
        except Exception as e:
            err = e
            time.sleep(3 * 2 ** t if t < tries - 1 else 0)
    raise NetError(str(err))


def fetch_ring(apn):
    r = post(GIS_PARCELS + "/query", {"where": f"APN='{str(apn).replace(chr(39), '')}'", "outFields": "APN,JURISDICTION",
                                      "returnGeometry": "true", "outSR": "4326", "f": "json"})
    f = (r.get("features") or [None])[0]
    rings = f and (f.get("geometry") or {}).get("rings")
    return sorted(rings, key=len, reverse=True)[0] if rings else None


def process(apn):
    """-> record dict (maybe {failed:true}); raises NetError for transient trouble."""
    ring = fetch_ring(apn)
    if not ring:
        return {"failed": True, "reason": "no parcel boundary from Assessor GIS"}
    lng0, lat0, kx, nx, ny, dx, dy, cells = grid(ring)
    if sum(c["inside"] for c in cells) < 3:
        return {"failed": True, "reason": "fewer than 3 sample points inside parcel", "ringHash": ring_hash(ring)}
    pts = [[lng0 + c["x"] / kx, lat0 + c["y"] / 110540] for c in cells]
    r = post(USGS, {"geometry": json.dumps({"points": pts, "spatialReference": {"wkid": 4326}}),
                    "geometryType": "esriGeometryMultipoint", "returnFirstValueOnly": "true", "f": "json"})
    if "samples" not in r:
        raise NetError("USGS reply without samples: " + str(r)[:120])

    def num(s):
        try:
            n = float(s["value"])
            return None if s["value"] == "" or n != n else n
        except (ValueError, TypeError, KeyError):
            return None
    v = [num(s) for s in r["samples"]]
    if len(v) != len(cells):
        return {"failed": True, "reason": "USGS returned wrong sample count", "ringHash": ring_hash(ring)}
    rec = build(ring, v)
    return rec or {"failed": True, "reason": "mostly NoData or too few valid cells", "ringHash": ring_hash(ring)}


def load_leads():
    d = json.loads(re.search(r"= (\{.*\});", DATA.read_text(), re.S).group(1))
    rank = {"Good": 0, "Maybe": 1}
    return sorted(d["leads"], key=lambda l: rank.get((l.get("verdict") or {}).get("label"), 2))


def save(apn, rec):
    f = OUT / f"{apn}.json"
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(rec, separators=(",", ":")))
    os.replace(tmp, f)


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--retry-failed", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    store = {f.stem: json.loads(f.read_text()) for f in OUT.glob("*.json")}
    todo = [l["apn"] for l in load_leads() if l["apn"] not in store or (a.retry_failed and store[l["apn"]].get("failed"))]
    if a.limit:
        todo = todo[:a.limit]
    log(f"{len(todo)} leads to do, {len(store)} stored")
    done = net = streak = 0
    with ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(process, apn): apn for apn in todo}
        for f in as_completed(futs):
            apn = futs[f]
            try:
                store[apn] = f.result()
                save(apn, store[apn])
                streak = 0
                log(apn, "FAILED: " + store[apn]["reason"] if store[apn].get("failed") else f"avg {store[apn]['avg']:.2f}%")
            except NetError as e:
                net += 1
                streak += 1
                log(apn, "network error (not stored):", e)
                if streak >= 20:
                    log("20 network errors in a row, USGS/GIS looks down; stopping")
                    for g in futs:
                        g.cancel()
                    break
            done += 1
    log(f"done: {len(store)} stored, {sum(1 for r in store.values() if r.get('failed'))} failed, {net} network errors this run")


if __name__ == "__main__":
    main()
