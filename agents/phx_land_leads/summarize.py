#!/usr/bin/env python3
"""Morning summary of the latest land-leads pull -> macOS notification (+ stdout)."""
import json, re, subprocess, sys
from pathlib import Path

d = json.loads(re.search(r"= (\{.*\});", (Path(__file__).resolve().parents[2] / "phx-land-leads" / "data.js").read_text(), re.S).group(1))
fresh = [l for l in d["leads"] if not l.get("stale")]
top = sorted(fresh, key=lambda l: -l["score"])[:3]
lines = [f"{len(fresh)} leads ({sum(l.get('isNew', False) for l in fresh)} new), {sum(l.get('stale', False) for l in d['leads'])} kept hot"]
lines += [f"{l['score']} {l['address'].split('  ')[0].title()} ({l['parcelStatus']})" for l in top]
msg = "\n".join(lines)
print(msg)
if "--print" not in sys.argv:
    subprocess.run(["osascript", "-e", f'display notification {json.dumps(msg)} with title "Phoenix Land Leads — {d["updated"]}"'])
