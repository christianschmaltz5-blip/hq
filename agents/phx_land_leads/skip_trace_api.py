#!/usr/bin/env python3
"""
Person -> contacts for phx-land-leads. Owner name + mailing address (already
free from Maricopa Assessor data, see find_leads.py) -> phones/emails via a
LICENSED skip-trace provider. Ported from the KW Black Hills skip-trace agent
(~/arc-dashboard/agents/skip_trace/skip_trace_api.py) — same provider pattern,
REISkip added as the recommended provider for Arizona (no monthly minimum).

Compliance: licensed provider only, DPPA/GLBA permissible-purpose, scrub DNC
before calling. No scraping fallback.

Config (no secrets in code):
  export SKIPTRACE_PROVIDER=reiskip     # or 'mock' (default when no key)
  export SKIPTRACE_API_KEY=...

Usage:
  python3 skip_trace_api.py "John Smith" "123 Main St, Phoenix AZ 85001"
  python3 skip_trace_api.py --demo
  python3 skip_trace_api.py --json "Jane Doe" "PO Box 9365, Phoenix AZ 85009"

Programmatic:
  from skip_trace_api import trace_person, from_lead
  contacts = from_lead(lead)   # lead = a find_leads.py record

Until a real key is set, everything runs against the MOCK provider (555-01xx
numbers) so the pipeline is testable with zero spend.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

TIMEOUT = 30
HEADERS = {"User-Agent": "Phoenix Land Leads Skip Trace (Christian Schmaltz)"}


def _post_json(url, payload, api_key):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), method="POST",
        headers={**HEADERS,
                 "Authorization": f"Bearer {api_key}",
                 "Content-Type": "application/json",
                 "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode())


def _empty_result(name, provider, matched=False, note=None):
    return {
        "name": name,
        "matched": matched,
        "provider": provider,
        "phones": [],
        "emails": [],
        "note": note,
    }


class Provider:
    name = "base"
    needs_key = True

    def __init__(self, api_key=None):
        self.api_key = api_key

    def trace(self, first, last, address):
        raise NotImplementedError


class MockProvider(Provider):
    """Deterministic fake data so the pipeline is testable with no key / no spend."""
    name = "mock"
    needs_key = False

    def trace(self, first, last, address):
        full = " ".join(x for x in [first, last] if x).strip()
        seed = sum(ord(c) for c in (full + (address or "")))
        res = _empty_result(full, self.name, matched=True,
                            note="MOCK data — not real. Set SKIPTRACE_PROVIDER + key to go live.")
        res["phones"] = [
            {"number": f"602-555-{seed % 100:02d}{(seed // 7) % 100:02d}", "type": "mobile", "dnc": False},
            {"number": f"602-555-{(seed // 3) % 100:02d}{(seed // 11) % 100:02d}", "type": "landline", "dnc": True},
        ]
        first_l = (first or "owner").lower()
        last_l = (last or "example").lower()
        res["emails"] = [f"{first_l}.{last_l}@example.com"]
        return res


class ReiSkipProvider(Provider):
    """REISkip — ~$0.10-0.15/match, no monthly minimum. Recommended default for
    phx-land-leads volume. Confirm exact endpoint/payload shape against
    reiskip.com API docs before going live — filled in from vendor docs at signup."""
    name = "reiskip"
    ENDPOINT = "https://api.reiskip.com/v1/skiptrace"

    def trace(self, first, last, address):
        full = " ".join(x for x in [first, last] if x).strip()
        payload = {
            "first_name": first or "",
            "last_name": last or "",
            "address": _split_address(address),
        }
        data = _post_json(self.ENDPOINT, payload, self.api_key)
        return _parse_generic(data, full, "reiskip")


def _parse_generic(data, full, provider):
    """Defensive parse: probes a few likely response shapes since exact vendor
    field names vary. Adjust once you have a real REISkip response to test against."""
    res = _empty_result(full, provider)
    persons = (data.get("results", {}).get("persons") if isinstance(data.get("results"), dict) else None) \
        or data.get("persons") or data.get("matches") or []
    if not persons:
        res["note"] = "No match."
        return res
    p = persons[0]
    res["matched"] = True
    for ph in (p.get("phoneNumbers") or p.get("phones") or []):
        num = ph.get("number") or ph.get("phoneNumber") if isinstance(ph, dict) else ph
        if num:
            res["phones"].append({
                "number": num,
                "type": ph.get("type") if isinstance(ph, dict) else None,
                "dnc": bool(ph.get("dnc") or ph.get("tcpa")) if isinstance(ph, dict) else False,
            })
    for em in (p.get("emails") or p.get("emailAddresses") or []):
        addr = em.get("email") if isinstance(em, dict) else em
        if addr:
            res["emails"].append(addr)
    return res


PROVIDERS = {p.name: p for p in (MockProvider, ReiSkipProvider)}


def _split_address(address):
    if not address:
        return {"street": "", "city": "", "state": "", "zip": ""}
    parts = [p.strip() for p in address.split(",")]
    street = parts[0] if parts else ""
    city = state = zip_ = ""
    tail = " ".join(parts[1:]) if len(parts) > 1 else ""
    m = re.search(r"([A-Za-z .'-]+?)\s+([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?\s*$", tail)
    if m:
        city, state, zip_ = m.group(1).strip(), m.group(2), (m.group(3) or "")
    return {"street": street, "city": city, "state": state, "zip": zip_}


def _split_name(full):
    toks = [t for t in re.split(r"\s+", (full or "").strip()) if t]
    if not toks:
        return "", ""
    if len(toks) == 1:
        return toks[0].title(), ""
    return toks[0].title(), toks[-1].title()


def _select_provider():
    name = (os.environ.get("SKIPTRACE_PROVIDER") or "").strip().lower()
    key = os.environ.get("SKIPTRACE_API_KEY")
    if not name:
        name = "reiskip" if key else "mock"
    cls = PROVIDERS.get(name)
    if cls is None:
        raise ValueError(f"Unknown SKIPTRACE_PROVIDER {name!r}. Options: {', '.join(PROVIDERS)}")
    if cls.needs_key and not key:
        raise RuntimeError(
            f"Provider {name!r} needs SKIPTRACE_API_KEY. Set it, or unset "
            f"SKIPTRACE_PROVIDER to use the mock provider.")
    return cls(api_key=key)


def trace_person(first, last, address):
    return _select_provider().trace(first, last, address)


TRUST_WORDS_RE = re.compile(
    r"\b(LIVING TRUST|REVOCABLE TRUST|FAMILY TRUST|TRUST|ESTATE OF|FAMILY|TR)\b")


def _name_from_trust(owner):
    """'BEFUS FAMILY LIVING TRUST' -> 'BEFUS'; 'PAMELA A LETNER LIVING TRUST' ->
    'PAMELA A LETNER'. Best-effort — a trust name isn't guaranteed to contain a
    clean person name, so results from this path are lower-confidence."""
    stripped = TRUST_WORDS_RE.sub("", owner)
    return re.sub(r"\s+", " ", stripped).strip()


def from_lead(lead):
    """Take a find_leads.py record and trace the owner.

    A true hidden owner (LLC/trust NOT at the property's own address) can't be
    traced directly — Arizona Business Connect (LLC-member lookup) is
    WAF+reCAPTCHA blocked (verified 2026-09-28), so those return a note instead
    of a contact. But a trust whose mailing address IS the property address
    (ownership.isOwnerOccupied) isn't hiding anyone — it's a family's own
    estate-planning wrapper, and the family surname is usually right in the
    trust name, so those get traced like a normal person (lower confidence).
    """
    if not lead or not lead.get("ownerName"):
        return _empty_result("", "n/a", note="No lead/owner to trace.")
    owner = lead["ownerName"]
    ownership = lead.get("ownership", {})
    if ownership.get("isHiddenOwner"):
        return _empty_result(
            owner, "n/a",
            note="Owner is an LLC/trust not at the property address — Arizona has "
                 "no free/automatable member lookup (Business Connect is "
                 "WAF+reCAPTCHA blocked). Trace the registered agent manually if "
                 "pursuing this lead.")
    if ownership.get("isEntityOwner") and ownership.get("isOwnerOccupied"):
        owner = _name_from_trust(owner)
    first, last = _split_name(owner)
    address = lead.get("ownerMailAddress")
    res = trace_person(first, last, address)
    if ownership.get("isEntityOwner") and ownership.get("isOwnerOccupied"):
        res["note"] = (res.get("note") or "") + \
            " Name extracted from a trust — verify before using."
    return res


def format_contacts(res):
    lines = [f"PERSON   : {res['name'] or '—'}   (via {res['provider']})"]
    if res.get("note"):
        lines.append(f"NOTE     : {res['note']}")
    if res["phones"]:
        lines.append("PHONES   :")
        for ph in res["phones"]:
            flags = " ".join(f for f in [ph.get("type"), "DNC" if ph.get("dnc") else ""] if f)
            lines.append(f"           {ph['number']}  {flags}".rstrip())
    else:
        lines.append("PHONES   : —")
    lines.append("EMAILS   : " + (", ".join(res["emails"]) if res["emails"] else "—"))
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="Person + address -> contacts (licensed skip trace)")
    ap.add_argument("name", nargs="?", help='full name, e.g. "John Smith"')
    ap.add_argument("address", nargs="?", help='mailing/property address')
    ap.add_argument("--json", action="store_true", help="output raw JSON")
    ap.add_argument("--demo", action="store_true", help="run the mock provider on sample data")
    args = ap.parse_args()

    if args.demo:
        os.environ.pop("SKIPTRACE_PROVIDER", None)
        os.environ.pop("SKIPTRACE_API_KEY", None)
        res = trace_person("John", "Smith", "123 Main St, Phoenix AZ 85001")
        print(format_contacts(res))
        return
    if not args.name:
        ap.error('give a name (and address), or use --demo')

    first, last = _split_name(args.name)
    try:
        res = trace_person(first, last, args.address)
    except (RuntimeError, ValueError) as e:
        print(f"Config error: {e}", file=sys.stderr)
        sys.exit(2)
    except urllib.error.URLError as e:
        print(f"Skip-trace failed (network/API error): {e}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(res, indent=2))
    else:
        print(format_contacts(res))


if __name__ == "__main__":
    main()
