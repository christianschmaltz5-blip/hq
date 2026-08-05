#!/bin/bash
# Weekly rent-comps scan — headless Claude Code run.
# Needs Chrome open with the Claude extension connected; the prompt aborts cleanly if not.
export PATH="/Users/christianschmaltz/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/christianschmaltz/hq || exit 1

echo "=== rent-comps run $(date) ==="
claude -p "$(cat agents/rent_comps/prompt.md)" \
  --model sonnet \
  --allowedTools "ToolSearch,Read,Write,Edit,Glob,Grep,Bash(git:*),Bash(cd:*),Bash(date:*),mcp__claude-in-chrome"
echo "=== rent-comps done $(date) exit=$? ==="
