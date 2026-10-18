# HQ — Christian's personal real-estate dashboard

Static site (GitHub Pages: https://christianschmaltz5-blip.github.io/hq/) plus Python jobs that refresh its data daily.
Owner: Christian Schmaltz, a licensed agent. Focus: finding North Phoenix land to buy and build custom homes on.
No build step. Pages are single HTML files with inline JS; data is `window.X = {...}` in a `data.js` next to each page.

## Pages and data
| Page | Data | Job |
|---|---|---|
| `phx-land-leads.html` (the main one) | `phx-land-leads/data.js`, `history.jsonl` | `agents/phx_land_leads/run.sh`, launchd ~8:55am |
| `phx-permits.html` | `phx-permits/data.js` | `agents/phx_permits/run.sh` |
| `phoenix-scan.html` | `phoenix-scan/` | `agents/phx_cap_scan/` |
| `index.html`, `dev-model.html`, `feasibility.html` | | |

## Land leads: how it works
1. `find_leads.py` scans Maricopa Assessor + Phoenix GIS parcels in North Phoenix zips, scores them (zoning, rezoning nearby, owner signals like estate/absentee/long hold, floodplain), keeps lots of 0.5 ac or more. Writes `data.js`.
2. `verdict.py` stamps each residential lead with a Good/Maybe/Pass verdict and `houseComps` (live Assessor query: 5 best-matching recent home sales within 1/2/3 mi).
3. `track.py` logs changes (lot sold to someone else). `summarize.py` sends the morning Mac notification (phone push if `NTFY_TOPIC` is set), including the top-profit leads.
4. `run.sh` commits and pushes `data.js` + `history.jsonl`.

Page layout: a tab bar (Leads, Maps, Calculator, Profit & Offers, Outreach, Tracking). Ranked Leads shows 25 until "Show all". Section-to-tab mapping is `tabsInit` at the bottom of the script.

## Underwriting math (keep `verdict.py` and `profitFor()` in the page identical)
- Sale price per sf = the **2nd-highest** of the 5 closest home sales (`houseComps.psf`; `medPsf` keeps the median). Chosen so one outlier sale can't set the price.
- Per home cost = build $/sf x sf, plus soft costs %, plus site work, plus land, then times (1 + 7% loan interest).
- Defaults: 3,800 sf, build $275-325/sf, soft 8%, site work $10k, selling cost 3% (Christian is the agent), profit target 10%.
- Land = county comps value if reliable, else assessed value. This is a proxy, not a market price.
- Lot split: homes = floor(lot sf x 0.85 / zoning minimum lot), max 4, each split home valued at 80%, $25k per split. Picks the better of 1 home vs the split.
- Verdict uses the $325/sf case: Good at margin >= 10% and not High risk, Maybe at >= 5% (or >= 10% at $275/sf), else Pass.
- The calculator's saved numbers live in the user's browser localStorage and override these defaults.

## Known facts and gotchas
- `landUseClass` comes from the county PUC code, not zoning. `currentZoning` is often null for unincorporated parcels.
- Maricopa GIS servers are slow; the page fails fast and offers a retry.
- Sensitivity: each $25/sf of build cost moves about $400k of affordable land on a 4-home deal; each $25/sf of sale price moves about $300k.
- The deal Christian is studying: APN 20338004C, 2812 W Cloud Rd, 3.34 ac. The owner paid $535k in April 2026, so the numbers only work with a lower land price or a structured option/JV deal. The real GC bid, zoning/lot-split confirmation and sewer/septic status are still unknown.
- Open issues: Maps tab reported as not loading after the tab change (redraw now waits 60 ms after the tab shows; not confirmed fixed). Skip-trace phone numbers are not verified.

## Rules
- Daily jobs push to git themselves. Don't commit `agents/phx_permits/geocode_cache.json` by accident; it changes every run.
- Never commit `.env` files or API keys (`agents/phx_land_leads/.env` is gitignored).
- Underwriting output is a screen, not an appraisal. Don't present a verdict as verified.
- Prefer editing existing files; keep the single-file-per-page pattern.
