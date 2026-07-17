#!/bin/bash
# Weekly Phoenix cap-rate scan — headless Claude Code run.
# Needs Chrome open with the Claude extension connected; the prompt aborts cleanly if not.
export PATH="/Users/christianschmaltz/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/christianschmaltz/hq || exit 1

echo "=== phx-cap-scan run $(date) ==="
claude -p "$(cat agents/phx_cap_scan/prompt.md)" \
  --model sonnet \
  --allowedTools "ToolSearch,Read,Write,Edit,Glob,Grep,Bash(git:*),Bash(cd:*),Bash(date:*),mcp__claude-in-chrome"
echo "=== phx-cap-scan done $(date) exit=$? ==="
