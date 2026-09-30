# Weekly Phoenix cap-rate scan (headless run)

You are re-running the Phoenix cap-rate spread scan and updating the "Phoenix Cap-Rate Watch" page data on Christian's personal hq site. Work token-frugally; this runs unattended every week.

## Step 1 — read the pre-scraped data
`agents/phx_cap_scan/scrape_crexi.py` already ran (headless, before this prompt) and wrote `agents/phx_cap_scan/scrape_output.json`. Read it — it has `searchPages` (raw text of the Crexi Phoenix multifamily search results, pages 1-3) and `detailPages` (full text of the shortlisted individual listing pages, already opened for you). Harvest address, price, units, stated cap from `searchPages`; use `detailPages` for anything needing a closer look.

## Step 2 — underwrite
Benchmarks: Class A 4.75%, B 4.90%, C 5.40%, 2–4 unit 5.50%. Qualify at benchmark + 1.00% (100bps). Rules:
- Stated caps are marketing. Where rents or NOI are disclosed, re-underwrite: EGI = rents × 12 × 0.95; opex 40% of EGI (42% pre-1980, 38% for 2–4 unit); NOI = EGI − opex. Implied expense ratio under 30% = pro-forma fluff, flag and re-underwrite.
- Confidence: HIGH (actual NOI/rent roll), MEDIUM (stated rents, est. expenses), LOW (stated cap only, unverified).
- Any spread ≥200bps gets a "story" note (deferred maintenance, restricted rents, specialty use, portfolio-only, etc.).
- Only report deals present in this run's scrape_output.json.

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
