#!/usr/bin/env python3
"""
Phoenix cap-rate underwriter — classifies a batch of listings pulled from
Crexi against class benchmarks, and flags stated-cap vs NOI/ask mismatches.

Usage: fill in LISTINGS below with what you pulled off each page's "Details"
block, then run: python3 underwrite.py
"""

BENCHMARKS = {"A": 4.75, "B": 4.90, "C": 5.40, "2-4 unit": 5.50}
QUALIFY_BPS = 100
NEAR_MISS_FLOOR_BPS = 50

# ponytail: flat list of dicts, no ORM/DB — this is a one-shot analysis tool
LISTINGS = [
    # {"name": ..., "ask": ..., "noi": ..., "stated_cap": ..., "cls": "C", "units": 9, "url": ...},
]


def classify(listing):
    ask = listing["ask"]
    noi = listing.get("noi")
    stated_cap = listing.get("stated_cap")
    cls = listing["cls"]
    benchmark = BENCHMARKS[cls]

    real_cap = round(noi / ask * 100, 2) if noi else stated_cap
    confidence = "HIGH" if noi and listing.get("actual_pnl") else ("MEDIUM" if noi else "LOW")

    mismatch = None
    if noi and stated_cap and abs(real_cap - stated_cap) > 0.3:
        mismatch = f"stated {stated_cap}% vs NOI/ask {real_cap}% — {abs(round((stated_cap - real_cap) * 100))}bps apart"

    spread_bps = round((real_cap - benchmark) * 100)
    if spread_bps >= QUALIFY_BPS:
        bucket = "QUALIFYING"
    elif spread_bps >= NEAR_MISS_FLOOR_BPS:
        bucket = "NEAR MISS"
    else:
        bucket = "below floor"

    return {
        **listing,
        "real_cap": real_cap,
        "benchmark": benchmark,
        "spread_bps": spread_bps,
        "bucket": bucket,
        "confidence": confidence,
        "mismatch": mismatch,
    }


def main():
    results = [classify(l) for l in LISTINGS]
    results.sort(key=lambda r: -r["spread_bps"])
    for r in results:
        line = f"[{r['bucket']:>10}] {r['name']:<35} {r['real_cap']}% (bench {r['benchmark']}%, +{r['spread_bps']}bps, {r['confidence']})"
        print(line)
        if r["mismatch"]:
            print(f"             ⚠ MISMATCH: {r['mismatch']}")


if __name__ == "__main__":
    assert classify({"ask": 1000000, "noi": 64000, "stated_cap": None, "cls": "C"})["real_cap"] == 6.4
    assert classify({"ask": 1000000, "noi": None, "stated_cap": 6.0, "cls": "C"})["bucket"] == "NEAR MISS"
    assert classify({"ask": 1000000, "noi": 60000, "stated_cap": 8.0, "cls": "C"})["mismatch"] is not None
    main()
