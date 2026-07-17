# Weekly Phoenix cap-rate scan (headless run)

You are re-running the Phoenix cap-rate spread scan and updating the "Phoenix Cap-Rate Watch" page data on Christian's personal hq site. Work token-frugally; this runs unattended every week.

## Step 0 — browser check
Load the Chrome tools in ONE ToolSearch call: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__computer". Call tabs_context_mcp. If the Chrome extension is unreachable after 2 attempts, print "PHX-SCAN SKIPPED: Chrome extension unreachable" and STOP — change nothing.

## Step 1 — scan (read-only browsing, user's real Chrome)
- CREATE A NEW TAB; never reuse existing tabs. Never log in, never submit forms, never accept terms/consent beyond privacy-preserving dismissal, never attempt to bypass a CAPTCHA or block — skip blocked sites.
- Crexi Phoenix multifamily search (crexi.com/properties?types=Multifamily&locations=Phoenix,AZ): get_page_text on search-result pages 1–3 (~40 listings/page). Harvest address, price, units, stated cap.
- Open at most 8 individual listing pages, only to verify shortlist candidates (anything that looks ≥ +80bps).

## Step 2 — underwrite
Benchmarks: Class A 4.75%, B 4.90%, C 5.40%, 2–4 unit 5.50%. Qualify at benchmark + 1.00% (100bps). Rules:
- Stated caps are marketing. Where rents or NOI are disclosed, re-underwrite: EGI = rents × 12 × 0.95; opex 40% of EGI (42% pre-1980, 38% for 2–4 unit); NOI = EGI − opex. Implied expense ratio under 30% = pro-forma fluff, flag and re-underwrite.
- Confidence: HIGH (actual NOI/rent roll), MEDIUM (stated rents, est. expenses), LOW (stated cap only, unverified).
- Any spread ≥200bps gets a "story" note (deferred maintenance, restricted rents, specialty use, portfolio-only, etc.).
- Only report deals seen live in the browser THIS run.

## Step 3 — update data
Edit ONLY /Users/christianschmaltz/hq/phoenix-scan/data.js (structure documented in its header comment):
- Replace `updated` (today's date), `listingsScanned`, `qualifying`, `nearMisses`, `disqualified` with this run's results.
- APPEND one entry to `history` (keep prior entries).
- Keep valid JS — the page reads window.PHX_SCAN directly.

## Step 4 — publish
```
cd /Users/christianschmaltz/hq
git add phoenix-scan/data.js
git commit -m "Phoenix cap-rate watch: weekly scan $(date +%Y-%m-%d)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```
Stage ONLY phoenix-scan/data.js — never `git add -A`.

Finish by printing a one-line summary: listings scanned, qualifying count, top spread.
