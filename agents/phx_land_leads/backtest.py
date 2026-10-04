#!/usr/bin/env python3
"""Research backtest: which kinds of North Phoenix lots actually got redeveloped?
Rebuild = single-family parcel built >= REBUILD_YEAR inside an established subdivision (median build year <= 1995).
Prints rebuild rate by lot size / zip / subdivision, rebuilt sale prices, and compares to the current lead list.
Parcel pull is cached (delete the cache file to refresh). Usage: backtest.py [cache.json]"""
import json, re, sys, statistics as st
from collections import defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import find_leads as f

REBUILD_YEAR = 2015
FIELDS = "APN,SUBNAME,CONST_YEAR,LAND_SIZE,LIVING_SPACE,SALE_DATE,SALE_PRICE,PUC,PHYSICAL_ZIP,PHYSICAL_ADDRESS"
cache = Path(sys.argv[1] if len(sys.argv) > 1 else "backtest_cache.json")
num = lambda v: float(re.sub(r"[^\d.]", "", str(v)) or 0)

if cache.exists():
    P = json.loads(cache.read_text())
else:
    zips = ",".join(f"'{z}'" for z in f.NORTH_PHOENIX_ZIPS)
    P, off = [], 0
    while True:
        r = f.esri_query(f.MARICOPA_PARCELS, {"where": f"PHYSICAL_ZIP IN ({zips})", "outFields": FIELDS,
                                              "orderByFields": "OBJECTID", "resultOffset": off, "resultRecordCount": 1000})
        feats = r.get("features") or []
        P += [x["attributes"] for x in feats]
        print(f"pulled {len(P)}", file=sys.stderr, flush=True)
        if len(feats) < 1000: break
        off += 1000
    cache.write_text(json.dumps(P))

sf = [p for p in P if (p.get("PUC") or "").startswith("01") and p.get("SUBNAME") and num(p.get("CONST_YEAR")) > 1900]
subs = defaultdict(list)
for p in sf: subs[p["SUBNAME"].strip()].append(num(p["CONST_YEAR"]))
established = {s for s, y in subs.items() if len(y) >= 15 and st.median(y) <= 1995}
pool = [p for p in sf if p["SUBNAME"].strip() in established]
for p in pool: p["_re"] = num(p["CONST_YEAR"]) >= REBUILD_YEAR
print(f"{len(P):,} parcels; {len(sf):,} single-family w/ subdivision; {len(established)} established subdivisions; "
      f"{len(pool):,} parcels in them; {sum(p['_re'] for p in pool):,} rebuilt since {REBUILD_YEAR}")

def rate(key, label, order=None):
    g = defaultdict(lambda: [0, 0])
    for p in pool:
        k = key(p); g[k][0] += 1; g[k][1] += p["_re"]
    print(f"\nRebuild rate by {label}:")
    for k in (order or sorted(g)):
        n, r = g[k]; print(f"  {str(k):<14} {n:>7,} parcels  {r:>5,} rebuilt  {100*r/max(n,1):5.2f}%")
band = lambda s: next(n for lim, n in [(8000, "<8k"), (10000, "8-10k"), (14000, "10-14k"), (20000, "14-20k"), (43560, "20k-1ac"), (1e12, "1ac+")] if s < lim)
order = ["<8k", "8-10k", "10-14k", "14-20k", "20k-1ac", "1ac+"]
rate(lambda p: band(p.get("LAND_SIZE") or 0), "lot size", order)
rate(lambda p: p.get("PHYSICAL_ZIP"), "zip")

by_sub = defaultdict(lambda: [0, 0])
for p in pool: by_sub[p["SUBNAME"].strip()][0] += 1; by_sub[p["SUBNAME"].strip()][1] += p["_re"]
print("\nHottest subdivisions (>=30 parcels):")
for s, (n, r) in sorted(((s, v) for s, v in by_sub.items() if v[0] >= 30), key=lambda t: -t[1][1] / t[1][0])[:12]:
    print(f"  {s[:42]:<42} {n:>5} parcels  {r:>4} rebuilt  {100*r/n:5.1f}%")

sold = [p for p in pool if p["_re"] and num(p.get("SALE_PRICE")) > 100000 and (p.get("SALE_DATE") or "")[-4:] >= "2022"]
print(f"\nRebuilt homes with a 2022+ sale on record: {len(sold)}")
for z in sorted({p['PHYSICAL_ZIP'] for p in sold}):
    ps = [p for p in sold if p["PHYSICAL_ZIP"] == z]
    if len(ps) >= 5:
        print(f"  {z}: n={len(ps):>3}  median sale ${st.median(num(p['SALE_PRICE']) for p in ps):>10,.0f}  "
              f"median $/sf ${st.median(num(p['SALE_PRICE'])/num(p['LIVING_SPACE']) for p in ps if num(p['LIVING_SPACE'])):>5,.0f}")

mf = [p for p in P if (p.get("PUC") or "").startswith("07") and num(p.get("CONST_YEAR")) >= REBUILD_YEAR]
print(f"\nMultifamily (PUC 07xx) built since {REBUILD_YEAR}: {len(mf)} parcels")
for p in sorted(mf, key=lambda p: -num(p.get("SALE_PRICE")))[:8]:
    print(f"  {p['PHYSICAL_ADDRESS'].split('  ')[0]:<28} built {p['CONST_YEAR']}  land {p['LAND_SIZE'] or 0:>8,.0f} sf  sale ${num(p.get('SALE_PRICE')):>12,.0f} {p.get('SALE_DATE')}")

try:
    d = json.loads(re.search(r"= (\{.*\});", (Path(f.OUT_PATH)).read_text(), re.S).group(1))
    imp = [l for l in d["leads"] if l["parcelStatus"] == "improved"]
    print("\nCurrent underused-lot leads by lot size (vs rebuild-rate table above):")
    from collections import Counter
    c = Counter(band(l["landSf"]) for l in imp)
    print("  " + "  ".join(f"{b}: {c[b]}" for b in order))
except Exception as e:
    print("lead comparison skipped:", e)
