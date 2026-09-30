#!/usr/bin/env python3
"""
Batch skip-trace runner for phx-land-leads. Reads the leads data.js find_leads.py
already produced, traces only the leads worth paying for (top score, non-LLC
owner, not already cached), and writes phones/emails back into data.js.

Why filtered: at $0.10-0.15/match (REISkip), tracing every lead is wasted spend
on ones that were never going to convert. Why cached: re-running this weekly
shouldn't re-pay for an owner already traced.

Usage:
  python3 run_skip_trace.py                  # top-scored leads, cache-aware
  python3 run_skip_trace.py --min-score 40 --limit 50
  python3 run_skip_trace.py --dry-run         # show who'd be traced, spend nothing
"""

import argparse
import json
import re
from pathlib import Path

from skip_trace_api import from_lead

DATA_PATH = Path(__file__).resolve().parents[2] / "phx-land-leads" / "data.js"
CACHE_PATH = Path(__file__).resolve().parent / "contact_cache.json"

DEFAULT_MIN_SCORE = 40
DEFAULT_LIMIT = 100


def _load_payload():
    text = DATA_PATH.read_text()
    m = re.search(r"window\.PHX_LAND_LEADS = (\{.*\});", text, re.S)
    if not m:
        raise RuntimeError(f"Couldn't find PHX_LAND_LEADS payload in {DATA_PATH}")
    return json.loads(m.group(1)), text, m.span(1)


def _write_payload(payload, text, span):
    new_json = json.dumps(payload, indent=2)
    new_text = text[:span[0]] + new_json + text[span[1]:]
    DATA_PATH.write_text(new_text)


def _load_cache():
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text())
    return {}


def _save_cache(cache):
    CACHE_PATH.write_text(json.dumps(cache, indent=2))


def _cache_key(lead):
    return lead.get("apn") or f"{lead.get('ownerName')}|{lead.get('ownerMailAddress')}"


def main():
    ap = argparse.ArgumentParser(description="Batch skip-trace the top phx-land-leads")
    ap.add_argument("--min-score", type=int, default=DEFAULT_MIN_SCORE)
    ap.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="max leads to trace this run")
    ap.add_argument("--dry-run", action="store_true", help="list who'd be traced, don't call the provider")
    args = ap.parse_args()

    payload, text, span = _load_payload()
    leads = payload["leads"]
    cache = _load_cache()

    candidates = [
        lead for lead in leads
        if lead.get("score", 0) >= args.min_score
        and not lead.get("ownership", {}).get("isEntityOwner")
        and _cache_key(lead) not in cache
    ][:args.limit]

    print(f"{len(leads)} leads total, {len(candidates)} eligible to trace "
          f"(score>={args.min_score}, non-entity, not cached)")

    if args.dry_run:
        for lead in candidates:
            print(f"  score={lead.get('score')}  {lead.get('ownerName')}  {lead.get('ownerMailAddress')}")
        return

    traced = 0
    for lead in candidates:
        key = _cache_key(lead)
        try:
            res = from_lead(lead)
        except (RuntimeError, ValueError) as e:
            print(f"Config error, stopping: {e}")
            break
        cache[key] = res
        traced += 1
        if traced % 20 == 0:
            print(f"  traced {traced}/{len(candidates)}...")

    for lead in leads:
        key = _cache_key(lead)
        if key in cache:
            lead["contacts"] = cache[key]

    _save_cache(cache)
    _write_payload(payload, text, span)
    print(f"Traced {traced} new lead(s), wrote contacts into {DATA_PATH}")


if __name__ == "__main__":
    main()
