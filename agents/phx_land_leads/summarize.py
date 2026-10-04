#!/usr/bin/env python3
"""Morning summary of the latest land-leads pull + new development + a term of the day.
Sends a Mac notification and, if NTFY_TOPIC is set, a phone push via ntfy.sh. `--print` = stdout only."""
import json, os, re, subprocess, sys, urllib.request
from datetime import date, timedelta
from pathlib import Path

HQ = Path(__file__).resolve().parents[2]
load = lambda f, k: json.loads(re.search(rf"{k} = (\{{.*\}});", (HQ / f).read_text(), re.S).group(1))
d = load("phx-land-leads/data.js", "window.PHX_LAND_LEADS")
fresh = [l for l in d["leads"] if not l.get("stale")]
top = sorted(fresh, key=lambda l: -l["score"])[:3]
lines = [f"{len(fresh)} leads ({sum(l.get('isNew', False) for l in fresh)} new), {sum(l.get('stale', False) for l in d['leads'])} kept hot"]
lines += [f"{l['score']} {l['address'].split('  ')[0].title()} ({l['parcelStatus']})" for l in top]

try:  # lost-to-someone-else events from track.py
    ev = [json.loads(x) for x in (HQ / "phx-land-leads/history.jsonl").read_text().splitlines()]
    ev = [e for e in ev if e.get("event") == "changed" and e["date"] == d["updated"]]
    if ev:
        lines.append(f"Changed hands: " + ", ".join(e["address"].title() for e in ev[:3]) + (f" +{len(ev)-3}" if len(ev) > 3 else ""))
except Exception:
    pass

try:  # biggest new building permits, last 7 days (phx_permits data)
    p = load("phx-permits/data.js", "window.PHX_PERMITS")
    cut = (date.today() - timedelta(days=7))
    big = sorted((s for s in p["sites"] if s["permitType"] == "BLD" and date.fromtimestamp(s["issueDateMs"] / 1000) >= cut),
                 key=lambda s: -s["valuation"])[:3]
    if big:
        lines.append("New development (7d):")
        lines += [f"${s['valuation']/1e6:.1f}M {s['address'].title()} - {s['contractor'].title()}" for s in big]
except Exception:
    pass

TERMS = [
    ("Entitlement", "government approvals (zoning, plat, site plan) that let you build"),
    ("Infill", "developing vacant/underused land inside already-built areas"),
    ("Absorption", "how fast new lots/homes sell or lease in a market"),
    ("Plat", "recorded map that divides land into lots, streets and easements"),
    ("By-right", "use allowed under current zoning, no rezoning or hearing needed"),
    ("Rezoning", "formal request to change a parcel's zoning district"),
    ("FAR", "floor-area ratio: building sq ft divided by lot sq ft"),
    ("Cap rate", "net operating income / price; yield if bought all-cash"),
    ("Basis", "your all-in cost in a deal, land plus improvements"),
    ("Lis pendens", "filing that a lawsuit affects title to a property"),
    ("Notice of trustee sale", "step in an AZ foreclosure; sale date is set"),
    ("Absentee owner", "owner whose mailing address differs from the property"),
    ("Spread / margin", "value minus cost; the profit cushion in a deal"),
    ("Residual land value", "what a developer can pay for land after all costs and profit"),
    ("Horizontal development", "turning raw land into finished lots: roads, utilities, grading"),
    ("Vertical development", "building the homes/buildings on finished lots"),
    ("Finished lot", "lot with utilities, roads and recorded plat, ready for a builder"),
    ("Option contract", "pay for the right to buy at a set price by a date"),
    ("Due diligence", "inspection period to verify title, survey, soil, zoning"),
    ("Assemblage", "combining adjacent parcels into one larger site"),
    ("Density", "units per acre allowed or built"),
    ("Setback", "required distance between a building and the lot line"),
    ("Floodplain", "FEMA-mapped area with flood risk; affects insurance and building"),
    ("Title commitment", "title company's promise to insure, listing exceptions"),
    ("Full cash value", "Maricopa Assessor's market value estimate; lags real sales"),
    ("Comp", "a recent nearby sale used to estimate value"),
    ("Hold period", "years the current owner has owned it; long holds = more motivated"),
    ("Teardown", "property worth more as land than as the existing structure"),
    ("Pro forma", "projected income/cost model for a deal"),
    ("Entitled land", "land that already has its approvals in place"),
]
t = TERMS[date.today().toordinal() % len(TERMS)]
lines.append(f"Term: {t[0]} - {t[1]}")

msg = "\n".join(lines)
print(msg)
if "--print" not in sys.argv:
    subprocess.run(["osascript", "-e", f'display notification {json.dumps(msg)} with title "Phoenix Land Leads - {d["updated"]}"'])
    if os.environ.get("NTFY_TOPIC"):
        urllib.request.urlopen(urllib.request.Request(f"https://ntfy.sh/{os.environ['NTFY_TOPIC']}", data=msg.encode(),
                               headers={"Title": f"Phoenix Land Leads {d['updated']}"}), timeout=15)
