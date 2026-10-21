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
- Total cost = homes × (build $/sf × sf × (1 + soft costs %) + site work), plus land, demolition and `(homes − 1) × split cost`, all times (1 + 7% financing). Single-lot ADU costs and resale premium apply only when configured; splits ignore ADUs.
- Defaults: 3,800 sf, build $275-325/sf, soft 8%, site work $10k, selling cost 3% (Christian is the agent), profit target 10%.
- Land = a valid per-APN override first, else county comps value if reliable, else assessed value. Overrides live in `agents/phx_land_leads/overrides.json`; each needs positive `landCost`, `source`, `sourceUrl`, ISO `observedAt` and `priceDate`, and `priceType` (for example, recorded historical sale versus asking price). `landPriceOverride` carries this metadata to the page; `landOverride` retains numeric compatibility. An unsourced or invalid entry is ignored with `landPriceOverrideError`. Cloud Road starts with its $535k April 2026 recorded sale, explicitly not a current asking price or offer. Model and assessed values remain proxies, not market prices.
- Supportable land = finished sale value × (1 − selling rate − target margin) / (1 + financing rate), less construction, site, demolition, splits and applicable ADU costs. The offer shown beside the price uses the $325/sf case and 10% target, and identifies the most supportable candidate strategy. Keep negative budgets signed: even free land cannot meet that target.
- Lot split: homes = floor(lot sf × usable share / zoning minimum lot), max 4, each split home valued at 80%, $25k per split. Usable share defaults to 85% in Python and the browser; the browser's parcel setting is editable and applies to both capacity and underwriting. The daily job uses 85%. Capacity is an estimate requiring confirmation. Picks the better of 1 home vs the split.
- Verdict uses the $325/sf case: Good at margin >= 10% and not High risk. Maybe requires profit >= 0 at $325/sf and either margin >= 5% there or margin >= 10% at $275/sf. Otherwise Pass.
- The calculator's saved numbers live in the user's browser localStorage and override these defaults.
- Comp results carry `source`, `sourceUrl`, `retrievedAt`, `fellBack`, `error`, and `fallbackReason`. County HTTP errors and ArcGIS error bodies stay visible. `newBuild` fallback is explicit and used in verdict metadata/risk; an unknown stored retrieval date stays null. `python3 agents/phx_land_leads/verdict.py --cached` recalculates stored data without a network request or invented retrieval time. Shared numeric fixtures live in `tests/underwriting-fixtures.json`; run Python tests with `python3 -m unittest discover -s tests` and the JS runner with `node --test tests/underwriting.test.mjs`.

## Known facts and gotchas
- `landUseClass` comes from the county PUC code, not zoning. `currentZoning` is often null for unincorporated parcels.
- Maricopa GIS servers are slow; the page fails fast and offers a retry.
- Sensitivity: each $25/sf of build cost moves about $400k of affordable land on a 4-home deal; each $25/sf of sale price moves about $300k.
- The deal Christian is studying: APN 20338004C, 2812 W Cloud Rd, 3.34 ac. The owner paid $535k in April 2026, so the numbers only work with a lower land price or a structured option/JV deal. The real GC bid, zoning/lot-split confirmation and sewer/septic status are still unknown.
- Maps were visually checked in a browser on 2026-10-21 after switching from Calculator; both map panels still need external GIS/tile availability. Skip-trace phone numbers are not verified.

## Rules
- Daily jobs push to git themselves. Don't commit `agents/phx_permits/geocode_cache.json` by accident; it changes every run.
- Never commit `.env` files or API keys (`agents/phx_land_leads/.env` is gitignored).
- Underwriting output is a screen, not an appraisal. Don't present a verdict as verified.
- Prefer editing existing files; keep the single-file-per-page pattern.

## October 21 exchange implementation
- Flood is confirmed only with `floodKnown === true`. False, null and missing are displayed as unknown and share the existing one-point unknown-risk penalty in Python and JS; explicit mapped floodplain remains two points.
- Browser risk includes the same two-point >$800/sf term as Python. Shared `riskCases` in the underwriting fixture cover that boundary and null flood flags.
- Missing sale-date display is honest, but the existing +15 score credit is retained. Do not silently change its weight. Deed-derived yearsHeld is separate from sale recency.
- Median sensitivity is a separate scenario, not a replacement for second-highest pricing. UI flags verdict flips and at least three shared comp sales across active leads. Python persists medianStress. Newly fetched comps retain APN, yearBuilt and distanceMi; do not invent provenance for old cached comps.
- Land/new-build query failures persist in landCompLookup/newBuildLookup; failed lookups cannot produce a usable newBuild price. Displayed error messages are escaped.
- Saved custom-home runs include ADU, split-cost, split-haircut, minimum-lot and lender DSCR fields plus usablePct. Older runs still load.
- Both rental calculators require a positive land/purchase price and use the lower of LTV and DSCR debt limits (editable minimum DSCR, default 1.25). calcRent includes demolition. Construction timing/lease-up and jurisdiction-specific ADU/split rules remain unverified/deferred.

- White map markers now explain why no residential verdict is available and open `openLeadScenario(apn)`. Current active no-verdict leads are commercial. Manual scenarios start with one rentable space, not residential density, and can use a county-price proxy only through an explicit button. User-entered scenarios remain separate from automatic verdict colors. Negative NOI implies zero income-based value/debt while still showing project losses.
