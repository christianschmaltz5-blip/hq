# Weekly rent-comps scan (headless run)

You are scanning Apartments.com for rent comps in tracked Phoenix zip codes and
updating `dev-model/rent-comps.js` on Christian's personal hq site. This feeds
the renovation-premium and current-rent assumptions in his real estate
underwriting model (dev-model.html). Work token-frugally; this runs unattended
every week.

## Step 0 — browser check
Load the Chrome tools in ONE ToolSearch call: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find". Call tabs_context_mcp. If the Chrome extension is unreachable after 2 attempts, print "RENT-COMPS SKIPPED: Chrome extension unreachable" and STOP — change nothing.

## Step 1 — determine tracked zips
Read `/Users/christianschmaltz/hq/phoenix-scan/data.js` first. Collect the distinct `zip` values from its `qualifying` and `nearMisses` arrays — these are the submarkets that actually matter this week. If that file has no entries yet, fall back to the last-used zip list already present in `rent-comps.js`'s `zips` field.

## Step 2 — scan (read-only browsing, user's real Chrome)
For each tracked zip:
- CREATE A NEW TAB; never reuse existing tabs. Never log in, never submit forms, never accept terms/consent beyond privacy-preserving dismissal, never attempt to bypass a CAPTCHA or block — skip blocked sites.
- Navigate to `https://www.apartments.com/phoenix-az-{zip}/`. Use `computer` scroll + screenshot (get_page_text on these listing pages tends to only return the first virtualized card — don't rely on it alone) to read through the visible listing cards: property name, address, unit type(s), price(s).
- Prioritize older/smaller garden-style properties (pre-1990, low-rise, no elevator/luxury amenities) over large new luxury communities — those are the closest comps to a Class B/C value-add deal.
- Open individual listing pages for any property whose "Pricing & Floor Plans" section shows BOTH a "Classic" (or unlabeled/base) and a "Renovated" tier for the same floor plan — this apples-to-apples pair is the most valuable data point (see 2026-08-05 finding: Acacia Gardens at 1515 W Missouri Ave, 85015, had 1x1 Classic $847 vs 1x1 Renovated $897, and 2x2 Classic $1,097 vs 2x2 Renovated $1,197). Open at most 6 individual listing pages per zip.
- Record every comp found, whether or not it has a Classic/Renovated pair — single-tier listings are still useful as general rent evidence.

## Step 3 — write data
Edit ONLY `/Users/christianschmaltz/hq/dev-model/rent-comps.js`. Structure (keep valid JS — the page reads `window.RENT_COMPS` directly):
```js
window.RENT_COMPS = {
  updated: "YYYY-MM-DD",
  zips: ["85015", "85014", ...],   // zips actually scanned this run
  comps: [
    { property: "Acacia Gardens", address: "1515 W Missouri Ave", zip: "85015",
      unitType: "1x1", beds: 1, sqft: 650, rent: 847, tier: "Classic",
      source: "apartments.com", url: "https://www.apartments.com/..." },
    // tier is "Classic", "Renovated", or null if the listing doesn't distinguish
  ]
}
```
Replace the entire file's contents with this run's results (don't append to old comps — old rent data goes stale fast; a full weekly refresh is correct here, unlike phx_cap_scan's `history` log).

## Step 4 — publish
```
cd /Users/christianschmaltz/hq
git add dev-model/rent-comps.js
git commit -m "Rent comps: weekly scan $(date +%Y-%m-%d)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```
Stage ONLY dev-model/rent-comps.js — never `git add -A`.

Finish by printing a one-line summary: zips scanned, comps found, Classic/Renovated pairs found.
