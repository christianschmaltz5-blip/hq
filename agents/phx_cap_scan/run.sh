#!/bin/bash
# Weekly Phoenix cap-rate scan — fully headless, no Chrome/extension dependency.
# Scrapes Crexi anonymously with its own throwaway Playwright browser (a saved
# login session was tried and rejected — Cloudflare blocks cookie replay
# through automation harder than an anonymous visit, see scrape_crexi.py),
# then hands the scraped text to Claude for underwriting.
export PATH="/Users/christianschmaltz/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/christianschmaltz/hq || exit 1

echo "=== phx-cap-scan run $(date) ==="
agents/phx_cap_scan/.venv/bin/python agents/phx_cap_scan/scrape_crexi.py \
  --out agents/phx_cap_scan/scrape_output.json
if [ $? -ne 0 ]; then
  echo "PHX-SCAN SKIPPED: scrape failed, see error above. Nothing committed."
  exit 1
fi

claude -p "$(cat agents/phx_cap_scan/prompt.md)" \
  --model sonnet \
  --allowedTools "Read,Write,Edit,Glob,Grep,Bash(git:*),Bash(cd:*),Bash(date:*)"
echo "=== phx-cap-scan done $(date) exit=$? ==="
