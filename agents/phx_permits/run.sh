#!/bin/bash
# Daily Phoenix permit pull — pure Python + stdlib, no browser dependency.
# Unlike phx-cap-scan (Crexi, browser-only), this hits a public unauthenticated
# JSON endpoint directly, so it actually works headless under launchd.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/christianschmaltz/hq || exit 1

echo "=== phx-permits run $(date) ==="
python3 agents/phx_permits/pull_permits.py || exit 1

if ! git diff --quiet -- phx-permits/data.js; then
  git add phx-permits/data.js
  git commit -m "phx-permits: daily pull $(date +%Y-%m-%d)"
  git push
fi
echo "=== phx-permits done $(date) exit=$? ==="
