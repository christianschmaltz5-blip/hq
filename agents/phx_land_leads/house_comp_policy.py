"""Comparable-home screen shared by daily house sales and new-build fallback.

These are explicit screening assumptions for the 3,800-sf plan, not an appraisal.
The browser mirrors this policy; shared fixtures check both implementations.
"""
import math
from statistics import median

HOUSE_COMP_POLICY = dict(id="home-3800-25pct-3m-v1", planSf=3800, minSf=2850,
                         maxSf=4750, minPrice=150000, maxPrice=3000000, minComps=3)


def eligible_home_sale(sf, price):
    try:
        sf, price = float(sf), float(price)
    except (TypeError, ValueError):
        return False
    return (math.isfinite(sf) and math.isfinite(price)
            and HOUSE_COMP_POLICY["minSf"] <= sf <= HOUSE_COMP_POLICY["maxSf"]
            and HOUSE_COMP_POLICY["minPrice"] <= price <= HOUSE_COMP_POLICY["maxPrice"])


def policy_description():
    p = HOUSE_COMP_POLICY
    return f"{p['minSf']:,}-{p['maxSf']:,} sf and ${p['minPrice']:,}-${p['maxPrice']:,}"


def filter_stored_house_comps(result):
    """Re-screen complete chosen rows, or require a policy-qualified aggregate.

    Stored new-build examples are incomplete: their aggregate is only usable
    when its full population was screened under this policy at retrieval.
    No retrieval time or replacement sales are invented during offline use.
    """
    hc = dict(result or {})
    rows = hc.get("comps")
    if isinstance(rows, list) and not hc.get("fellBack"):
        rows = [c for c in rows if isinstance(c, dict) and eligible_home_sale(c.get("sf"), c.get("price"))][:5]
        hc.update(comps=rows, n=len(rows), selectionPolicy=HOUSE_COMP_POLICY["id"])
        if len(rows) >= HOUSE_COMP_POLICY["minComps"]:
            psfs = [float(c["price"]) / float(c["sf"]) for c in rows]
            rounded = lambda value: math.floor(value + 0.5)  # same as browser Math.round
            hc.update(psf=rounded(sorted(psfs, reverse=True)[1]), medPsf=rounded(median(psfs)),
                      price=rounded(median(float(c["price"]) for c in rows)), lowPsf=rounded(min(psfs)), highPsf=rounded(max(psfs)),
                      requiresRefresh=False)
            return hc
    elif (hc.get("selectionPolicy") == HOUSE_COMP_POLICY["id"]
          and isinstance(hc.get("psf"), (int, float)) and math.isfinite(hc["psf"]) and hc["psf"] > 0
          and (hc.get("n") or 0) >= HOUSE_COMP_POLICY["minComps"] and not hc.get("requiresRefresh")):
        return hc
    else:
        hc["n"] = 0
    for key in ("psf", "medPsf", "price", "lowPsf", "highPsf", "arv"):
        hc.pop(key, None)
    hc["requiresRefresh"] = True
    hc["fallbackReason"] = hc.get("fallbackReason") or (
        f"Fewer than 3 home sales meeting {policy_description()}; refresh county comps")
    return hc
