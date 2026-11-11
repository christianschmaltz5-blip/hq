#!/bin/sh
# Loads the dashboard pages in headless Chrome and fails on any uncaught JS error (the Node tests can't see load-order bugs).
# Needs network for Leaflet/tiles; exit 0 if Chrome is missing so a missing browser never blocks a run.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || exit 0
cd "$(dirname "$0")/.." || exit 1
rc=0
for p in phx-land-leads.html phx-permits.html phx-onepager.html naos.html; do
  out=$("$CHROME" --headless=new --disable-gpu --enable-logging=stderr --v=0 --virtual-time-budget=8000 --dump-dom "file://$PWD/$p" 2>&1 >/dev/null | grep -E 'CONSOLE.*(Uncaught|ReferenceError|TypeError|SyntaxError)')
  [ -n "$out" ] && { echo "$p: $out"; rc=1; }
done
exit $rc
