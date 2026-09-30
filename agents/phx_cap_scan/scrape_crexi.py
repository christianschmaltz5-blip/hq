#!/usr/bin/env python3
"""
Headless Crexi scraper for the weekly Phoenix cap-rate scan — replaces the old
claude-in-chrome dependency (which needed Christian's personal Chrome open with
the extension connected, breaking silently for weeks when it wasn't).

Runs fully anonymous, no login. Headless Playwright passes Crexi's bot
protection fine for anonymous browsing (verified 2026-09-29 — plain HTTP
requests get 403, a real rendering browser doesn't). A logged-in session was
tried and rejected: replaying saved cookies through an automated browser
tripped Cloudflare's bot check harder than going in anonymous (verified
2026-09-29 — same cookies that work in Christian's real Chrome get "Verifying
you are human" every time through Playwright, headless or headed).

Tradeoff accepted: some listings mask Units/Net Rentable SqFt/Year Built for
anonymous visitors. Price and stated cap % (the two fields the underwriting
logic actually screens on) are visible either way, usually right in the
listing title — masked fields are a completeness gap, not a blocker.

Pulls search-result pages (raw text, cap rates/prices visible inline) plus a
regex-based shortlist of anything that looks like it might clear the cap-rate
benchmark + 80bps, then opens just those listing pages for detail. Writes one
JSON file the underwriting prompt reads instead of live-browsing.

Usage: .venv/bin/python scrape_crexi.py [--pages 3] [--out scrape_output.json]
"""

import argparse
import json
import random
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

SEARCH_URL = "https://www.crexi.com/properties?types=Multifamily&locations=Phoenix,AZ"
USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
# Same benchmarks as prompt.md's underwriting rules — used only to shortlist
# which listings are worth a detail-page fetch, final judgment stays with the LLM.
BENCHMARK_CAP = {"default": 4.90}  # can't tell class from search text alone; use B as floor
QUALIFY_SPREAD = 0.80  # percentage points
MAX_DETAIL_PAGES = 15

CAP_RE = re.compile(r"([\d.]+)\s*%\s*CAP", re.I)
PRICE_RE = re.compile(r"\$([\d,]+)(?!\s*/)")
UNITS_RE = re.compile(r"(\d+)\s*Units?\b", re.I)

CHALLENGE_MARKERS = ("Performing security verification", "Verifying you are human")


def _is_challenged(text):
    return any(m in text for m in CHALLENGE_MARKERS)


def _fetch_text(p, url, retries=2):
    """Fetch a page's text, retrying with a fresh browser + longer human-like
    delay if Cloudflare challenges it. Rapid sequential requests from the same
    automated session escalate its bot score fast (verified 2026-09-29:
    page 1 of a run goes through clean, pages 2+ get challenged) — a fresh
    browser instance plus a real pause resets that."""
    for attempt in range(retries):
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(user_agent=USER_AGENT)
            page.goto(url, timeout=30000, wait_until="domcontentloaded")
            page.wait_for_timeout(random.randint(4000, 7000))
            text = page.inner_text("body")
            if not _is_challenged(text):
                return text
        finally:
            browser.close()
        time.sleep(random.uniform(15, 25))
    return None


def _parse_cards(text):
    """Best-effort split of the raw page text into per-listing chunks."""
    chunks = re.split(r"\nFor Sale\n", text)
    listings = []
    for chunk in chunks[1:]:
        price_m = PRICE_RE.search(chunk)
        cap_m = CAP_RE.search(chunk)
        units_m = UNITS_RE.search(chunk)
        lines = [l.strip() for l in chunk.splitlines() if l.strip()]
        title = lines[1] if len(lines) > 1 else ""
        listings.append({
            "title": title,
            "price": int(price_m.group(1).replace(",", "")) if price_m else None,
            "statedCapPct": float(cap_m.group(1)) if cap_m else None,
            "units": int(units_m.group(1)) if units_m else None,
            "raw": chunk[:400],
        })
    return listings


def scrape(pages=3, out_path="scrape_output.json"):
    result = {"searchPages": [], "listings": [], "detailPages": {}, "blocked": []}
    listing_urls = []
    with sync_playwright() as p:
        for n in range(1, pages + 1):
            url = SEARCH_URL if n == 1 else f"{SEARCH_URL}&page={n}"
            text = _fetch_text(p, url)
            if text is None:
                result["blocked"].append(url)
                continue
            result["searchPages"].append(text)
            result["listings"].extend(_parse_cards(text))

        # Collect listing URLs from a single lightweight pass (search page 1 only —
        # cheap enough not to need retry logic since it already succeeded above).
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(user_agent=USER_AGENT)
            page.goto(SEARCH_URL, timeout=30000, wait_until="domcontentloaded")
            page.wait_for_timeout(4000)
            for a in page.query_selector_all('a[href*="/properties/"]'):
                href = a.get_attribute("href")
                if href and "requestInfo" not in href:
                    listing_urls.append(
                        href if href.startswith("http") else f"https://www.crexi.com{href}")
        finally:
            browser.close()

        shortlist = [l for l in result["listings"]
                     if l["statedCapPct"] and l["statedCapPct"] - BENCHMARK_CAP["default"] >= QUALIFY_SPREAD]
        shortlist_titles = {l["title"] for l in shortlist}
        detail_urls = []
        for url in dict.fromkeys(listing_urls):  # dedupe, keep order
            if len(detail_urls) >= MAX_DETAIL_PAGES:
                break
            if any(t and t.split("|")[0].strip()[:20] in url.replace("-", " ") for t in shortlist_titles):
                detail_urls.append(url)
        if not detail_urls:
            detail_urls = list(dict.fromkeys(listing_urls))[:MAX_DETAIL_PAGES]

        for url in detail_urls:
            text = _fetch_text(p, url)
            if text is None:
                result["blocked"].append(url)
                continue
            result["detailPages"][url] = text[:6000]

    Path(out_path).write_text(json.dumps(result, indent=2))
    print(f"Scraped {len(result['searchPages'])} search page(s), "
          f"{len(result['listings'])} listing cards, "
          f"{len(result['detailPages'])} detail page(s), "
          f"{len(result['blocked'])} blocked after retries -> {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=3)
    ap.add_argument("--out", default="scrape_output.json")
    args = ap.parse_args()
    try:
        scrape(pages=args.pages, out_path=args.out)
    except Exception as e:
        print(f"SCRAPE FAILED: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
