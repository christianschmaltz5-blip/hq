#!/bin/bash
# Daily North Phoenix land-leads pull — public GIS/Assessor records only,
# no browser dependency (same reliability profile as phx_permits).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/christianschmaltz/hq || exit 1

LOG=/tmp/hq-phx-land-leads.log
notify() { osascript -e "display notification \"$1\" with title \"Phoenix Land Leads\"" 2>/dev/null; }

echo "=== phx-land-leads run $(date) ==="
if ! python3 agents/phx_land_leads/find_leads.py; then
  notify "Pull FAILED or came back empty — data left unchanged. See $LOG"
  exit 1
fi

# Skip-trace step only runs once a real provider key is configured — put it in
# agents/phx_land_leads/.env (gitignored, never committed). No-op until then.
if [ -f agents/phx_land_leads/.env ]; then
  set -a
  source agents/phx_land_leads/.env
  set +a
fi
if [ -n "$SKIPTRACE_API_KEY" ]; then
  echo "--- skip-trace: key found, tracing top leads ---"
  (cd agents/phx_land_leads && python3 run_skip_trace.py) || { echo "skip-trace step failed, continuing"; notify "Skip-trace step failed (pull itself OK)"; }
else
  echo "--- skip-trace: no SKIPTRACE_API_KEY set, skipping ---"
fi

if ! git diff --quiet -- phx-land-leads/data.js; then
  git add phx-land-leads/data.js
  git commit -m "phx-land-leads: daily pull $(date +%Y-%m-%d)"
  git push || notify "Pull OK but git push FAILED — dashboard not updated"
fi
python3 agents/phx_land_leads/summarize.py
echo "=== phx-land-leads done $(date) ==="
