#!/usr/bin/env python3
"""Auto-underwrite: runs the dashboard's Top-Profit model (profitFor in phx-land-leads.html) on every lead that has
nearby new-build sales, and stamps l["verdict"] = Good / Maybe / Pass. Assumptions mirror the Custom Home Calculator
defaults; build cost and site work are PLACEHOLDERS until the builder gives real numbers. Standalone: `python3 verdict.py`."""
import json, math, re
from pathlib import Path

A = dict(sf=3500, hard=(300, 350), soft=0.12, site=120_000, fin=0.07, sell=0.06,   # ponytail: edit here if the page defaults change
         split_cost=25_000, haircut=0.8, min_lot=10_000, good=0.15, maybe=0.08)


def split_n(l):
    m = re.match(r"(?:R1|RE)-(\d+)", l.get("currentZoning") or "", re.I)
    min_lot = int(m.group(1)) * 1000 if m else A["min_lot"]
    return max(1, min(4, math.floor((l.get("landSf") or 0) * 0.85 / min_lot))), bool(m)


def underwrite(l):
    nb, v = l.get("newBuild"), l.get("valuation") or {}
    if l.get("parcelStatus") != "vacant" or l.get("landUseClass") != "residential" or not nb or not nb.get("psf"):
        return None   # only vacant residential lots for now; commercial and teardowns are left alone
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
    risk = ((0 if land_ok else 2) + (nb["n"] < 6) + (nb.get("radiusMi", 0) >= 3) + 2 * bool(l.get("inFloodplain"))
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
