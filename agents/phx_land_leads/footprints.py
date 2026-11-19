"""Building-footprint check. The County Assessor lags: a newly built (or never-recoded) house can still read
"vacant", so a vacant-coded parcel with a house footprint on it is treated as built and dropped.
Footprints = OpenStreetMap (which carries Microsoft Building Footprints) via Overpass.
A hit means a building stood there when the footprints were drawn (imagery can be a few years old);
a miss does NOT prove the lot is empty. Failures never filter anything and are never cached."""
import json
import math
import threading
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

CACHE = Path(__file__).with_name("footprint_cache.json")
OVERPASS = "https://overpass-api.de/api/interpreter"
NOT_HOUSES = {"shed", "garage", "garages", "carport", "roof", "hut", "greenhouse", "service", "barn"}
RECHECK_DAYS = 60       # a "no building" answer is re-checked after this; a "building" answer is kept
BATCH = 25
BUDGET_S = 1200         # stop checking new parcels after this long; unchecked parcels pass through
REMOVED = []            # [{apn, address}] dropped this run, written into data.js so nothing vanishes silently
_lock = threading.Lock()
_t0 = time.time()


def _radius_m(land_sf):
    return max(15.0, 0.5 * math.sqrt(land_sf or 0) * 0.3048)   # half the side of a square lot of that size


def _dist_m(lat1, lng1, lat2, lng2):
    return math.hypot((lat2 - lat1) * 111000, (lng2 - lng1) * 111000 * math.cos(math.radians(lat1)))


def _overpass(query):
    body = urllib.parse.urlencode({"data": query}).encode()
    for _ in range(3):
        try:
            req = urllib.request.Request(OVERPASS, body, headers={"User-Agent": "hq-land-leads"})
            return json.loads(urllib.request.urlopen(req, timeout=90).read())
        except Exception:
            time.sleep(5)
    return None


def _load():
    try:
        return json.loads(CACHE.read_text())
    except Exception:
        return {}


def built_apns(parcels):
    """parcels: iterable of (apn, lat, lng, land_sf). Returns the set of APNs with a house footprint on them."""
    cache, today, built, todo = _load(), date.today(), set(), []
    for apn, lat, lng, sf in parcels:
        hit = cache.get(apn)
        fresh = hit and (hit["b"] or (today - date.fromisoformat(hit["d"])).days < RECHECK_DAYS)
        if fresh:
            if hit["b"]:
                built.add(apn)
        elif lat is not None and lng is not None:
            todo.append((apn, lat, lng, sf))
    for i in range(0, len(todo), BATCH):
        if time.time() - _t0 > BUDGET_S:
            print(f"  footprints: time budget hit, {len(todo) - i} parcels left unchecked")
            break
        chunk = todo[i:i + BATCH]
        q = "[out:json][timeout:80];(" + "".join(
            f'way["building"](around:{_radius_m(sf):.0f},{lat},{lng});' for _, lat, lng, sf in chunk) + ");out center;"
        r = _overpass(q)
        if r is None:
            continue   # lookup failed: don't filter, don't cache
        houses = [(e["center"]["lat"], e["center"]["lon"]) for e in r["elements"]
                  if (e.get("tags") or {}).get("building") not in NOT_HOUSES]
        with _lock:
            cache = _load()
            for apn, lat, lng, sf in chunk:
                b = any(_dist_m(lat, lng, a, o) <= _radius_m(sf) for a, o in houses)
                cache[apn] = {"b": b, "d": today.isoformat()}
                if b:
                    built.add(apn)
            CACHE.write_text(json.dumps(cache))
        time.sleep(2)
    return built


def drop_built(parcels):
    """Assessor-shaped parcels (APN, LATITUDE, LONGITUDE, LAND_SIZE, PHYSICAL_ADDRESS) -> those with no house footprint."""
    built = built_apns((p.get("APN"), p.get("LATITUDE"), p.get("LONGITUDE"), p.get("LAND_SIZE")) for p in parcels)
    for p in parcels:
        if p.get("APN") in built and not any(r["apn"] == p["APN"] for r in REMOVED):
            REMOVED.append({"apn": p["APN"], "address": (p.get("PHYSICAL_ADDRESS") or "").strip()})
    return [p for p in parcels if p.get("APN") not in built]
