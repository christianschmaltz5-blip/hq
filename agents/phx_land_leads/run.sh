#!/bin/bash
# Daily North Phoenix land-leads pull — public GIS/Assessor records only,
# no browser dependency (same reliability profile as phx_permits).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/christianschmaltz/hq || exit 1

echo "=== phx-land-leads run $(date) ==="
python3 agents/phx_land_leads/find_leads.py || exit 1

if ! git diff --quiet -- phx-land-leads/data.js; then
  git add phx-land-leads/data.js
  git commit -m "phx-land-leads: daily pull $(date +%Y-%m-%d)"
  git push
fi
echo "=== phx-land-leads done $(date) exit=$? ==="
