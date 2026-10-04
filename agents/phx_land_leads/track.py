#!/usr/bin/env python3
"""Daily outcome tracker: snapshot every shown lead, flag ones whose owner/sale date changed
since the last snapshot ("someone got there first"). Backtest source: phx-land-leads/history.jsonl."""
import json, re
from datetime import date
from pathlib import Path

HIST = Path(__file__).resolve().parents[2] / "phx-land-leads" / "history.jsonl"
DATA = HIST.with_name("data.js")


def track():
    d = json.loads(re.search(r"= (\{.*\});", DATA.read_text(), re.S).group(1))
    today = d["updated"]
    rows = [json.loads(x) for x in HIST.read_text().splitlines()] if HIST.exists() else []
    if any(r.get("date") == today for r in rows):
        return []
    prev_date = max((r["date"] for r in rows if r.get("score") is not None), default=None)
    prev = {r["apn"]: r for r in rows if r.get("date") == prev_date and "apn" in r}
    snap = [{"date": today, "apn": l["apn"], "score": l["score"], "saleDate": l.get("saleDate"),
             "owner": l.get("ownerName")} for l in d["leads"]]
    events = [{"date": today, "event": "changed", "apn": s["apn"], "address": l["address"].split("  ")[0],
               "scoreWas": prev[s["apn"]]["score"], "ownerWas": prev[s["apn"]]["owner"], "ownerNow": s["owner"]}
              for s, l in zip(snap, d["leads"]) if s["apn"] in prev
              and (s["saleDate"], s["owner"]) != (prev[s["apn"]]["saleDate"], prev[s["apn"]]["owner"])
              and prev[s["apn"]].get("saleDate") is not None]  # old snapshots lacked saleDate -> skip
    with HIST.open("a") as f:
        for r in snap + events:
            f.write(json.dumps(r) + "\n")
    return events


if __name__ == "__main__":
    ev = track()
    print(f"tracked; {len(ev)} leads changed hands since last snapshot")
