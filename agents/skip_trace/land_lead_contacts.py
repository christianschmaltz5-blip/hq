#!/usr/bin/env python3
"""
North Phoenix Land Leads -> people -> contacts

Maricopa Assessor OWNER_NAME comes in a handful of recognizable shapes.
Unlike an LLC (opaque, needs a corporate filing lookup that's CAPTCHA-gated
in Arizona -- see the land-leads methodology note), most of these trust/
co-owner formats already contain a real person's name:

    "PAMELA A LETNER LIVING TRUST"     -> one person: Pamela A Letner
    "LOFANO MICHAEL D/PATRICIA A TR"   -> two people, shared surname Lofano
    "HOFFMAN DOROTHY M/CLARE L"        -> two people, shared surname Hoffman
    "BEFUS FAMILY LIVING TRUST"        -> surname only, no first name -- can't
                                           split into a real person; flagged
                                           as ambiguous rather than guessed
    "3005 BELL ROAD SP LLC"            -> entity, no person extractable here

This script parses those shapes, then runs each identified person through
skip_trace_api.trace_person() to get phone/email. Until SKIPTRACE_PROVIDER
+ SKIPTRACE_API_KEY are set, every result is MOCK data (555 numbers) --
that's intentional so the pipeline is checkable end-to-end before you spend
anything on a real provider.

Usage:
  python3 land_lead_contacts.py                # top 10 leads by score
  python3 land_lead_contacts.py --top 25
  python3 land_lead_contacts.py --json
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from skip_trace_api import trace_person, format_contacts  # noqa: E402

DATA_JS = (Path(__file__).parent / "../.." / "phx-land-leads" / "data.js").resolve()

FAMILY_TRUST_GENERIC = re.compile(r"^([A-Z' -]+?)\s+FAMILY (LIVING )?TRUST$")
NAMED_TRUST = re.compile(r"^([A-Z' -]+?)\s+([A-Z] )?([A-Z' -]+?)\s+(LIVING )?TRUST$")
SLASH_COOWNER = re.compile(r"^([A-Z' -]+?)\s+([A-Z' .]+?)/([A-Z' .]+?)\s*(TR)?$")
ENTITY_HINTS = ("LLC", "LP", "LLP", "INC", "CORP", "CO ", " CO$", "TRUST CO")


def load_leads():
    text = DATA_JS.read_text()
    m = re.search(r"window\.PHX_LAND_LEADS = (\{.*\});", text, re.DOTALL)
    return json.loads(m.group(1))["leads"]


def parse_owner_name(owner_name):
    """Best-effort: owner string -> list of (first, last) real people, or []
    if it's an entity / too generic to split without guessing."""
    name = (owner_name or "").strip().upper()
    if not name:
        return []
    if any(h in name for h in ENTITY_HINTS):
        return []  # LLC/Corp -- needs an entity lookup, not a name split

    # "LOFANO MICHAEL D/PATRICIA A TR" -> surname + two given names split on '/'
    m = SLASH_COOWNER.match(name)
    if m and "/" in name:
        surname = m.group(1).strip()
        first_a = m.group(2).strip().split()[0]  # drop middle initial
        first_b = m.group(3).strip().split()[0]
        return [(first_a.title(), surname.title()), (first_b.title(), surname.title())]

    # "PAMELA A LETNER LIVING TRUST" -> First [Middle] Last
    m = NAMED_TRUST.match(name)
    if m and not FAMILY_TRUST_GENERIC.match(name):
        first = m.group(1).split()[0].title()
        last = m.group(3).strip().title()
        return [(first, last)]

    # "BEFUS FAMILY LIVING TRUST" -> surname only, no first name to trace
    if FAMILY_TRUST_GENERIC.match(name):
        return []

    return []


def run(top_n, as_json):
    leads = sorted(load_leads(), key=lambda l: -l["score"])[:top_n]
    out = []
    for lead in leads:
        people = parse_owner_name(lead.get("ownerName"))
        entry = {
            "address": lead.get("address"),
            "score": lead.get("score"),
            "ownerName": lead.get("ownerName"),
            "people": [],
        }
        if not people:
            entry["note"] = (
                "LLC/entity -- needs a corporate filing lookup (blocked by CAPTCHA in AZ)"
                if any(h in (lead.get("ownerName") or "").upper() for h in ENTITY_HINTS)
                else "Owner name too generic to split into a real person (e.g. a bare "
                     "'FAMILY TRUST') -- check the recorded deed for the trustee's name."
            )
        for first, last in people:
            contact = trace_person(first, last, lead.get("ownerMailAddress"))
            entry["people"].append({"name": f"{first} {last}", **contact})
        out.append(entry)

    if as_json:
        print(json.dumps(out, indent=2))
        return

    for entry in out:
        print(f"\n=== {entry['address']} (score {entry['score']}) — {entry['ownerName']} ===")
        if entry.get("note"):
            print(f"  {entry['note']}")
        for p in entry["people"]:
            print("  " + format_contacts(p).replace("\n", "\n  "))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    run(args.top, args.json)
