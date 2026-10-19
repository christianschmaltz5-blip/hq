#!/bin/bash
# Claude + Codex exchange, morning and evening. Codex advises (read-only), Claude checks it against the code,
# Codex debriefs on Claude's draft, Claude writes the final best-of-both to agents/exchange/YYYY-MM-DD-am|pm.md
# and pushes a short summary to the phone. Never edits site files, never commits.
export PATH="/Users/christianschmaltz/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
unset ANTHROPIC_API_KEY   # that key is out of credit; use the Claude login instead
cd /Users/christianschmaltz/hq || exit 1
[ -f agents/phx_land_leads/.env ] && { set -a; source agents/phx_land_leads/.env; set +a; }   # NTFY_TOPIC for the phone push

SLOT=$([ "$(date +%H)" -lt 12 ] && echo am || echo pm)
OUT=agents/exchange/$(date +%Y-%m-%d)-$SLOT.md
notify() { osascript -e "display notification \"$1\" with title \"Claude + Codex\"" 2>/dev/null; }
claude_p() { claude -p --permission-mode default --allowedTools "Read,Grep,Glob,Bash(git log:*),Bash(git diff:*)" 2>>/tmp/hq-exchange.log; }   # prompt on stdin
LAST=$(ls -t agents/exchange/*.md 2>/dev/null | head -1)
CTX="Read AGENTS.md and run 'git log --oneline -15'. ${LAST:+Our previous exchange is in $LAST.}"

echo "=== exchange $SLOT $(date) ==="
CODEX=$(codex exec -s read-only "$CTX You are advising on Christian's HQ real-estate dashboard (find North Phoenix land, build custom homes). Give your 5 best ideas or risks for the website right now: data quality, underwriting math, new features, bugs, and new development angles (ADUs, casitas, lot splits, build-to-rent, Phoenix zoning/permit changes). Cite files and lines. Do not modify files." 2>/dev/null) \
  || { notify "Codex step FAILED, see /tmp/hq-exchange.log"; exit 1; }

DRAFT=$(printf '%s' "$CTX Here is Codex's advice for today:

$CODEX

Check each point against the actual code. Write a markdown summary with: Agreed (both of us), Codex only (verified or not), Claude only (things Codex missed), Disagreements with reasons, and the top 3 recommended actions ranked. Do not edit any files; output only the summary." | claude_p) \
  || { notify "Claude step FAILED, see /tmp/hq-exchange.log"; exit 1; }

DEBRIEF=$(codex exec -s read-only "$CTX Claude reviewed your advice and wrote this draft:

$DRAFT

Debrief: say what you accept, what you reject and why (cite code), and anything Claude got wrong or missed. Under 250 words. Do not modify files." 2>/dev/null) || DEBRIEF="(Codex debrief unavailable)"

printf '%s' "Here is the draft summary and Codex's debrief of it.

DRAFT:
$DRAFT

CODEX DEBRIEF:
$DEBRIEF

Write the FINAL best-of-both summary for Christian: what we agree on, what is still disputed (and which side the code supports), what is unverified, and the top 3 actions. Plain language. Do not edit files. End with a section titled exactly '## Phone summary' containing at most 500 characters: the top 3 actions as short lines, no markdown." \
  | claude_p > "$OUT" || { notify "Final step FAILED, see /tmp/hq-exchange.log"; exit 1; }

notify "$SLOT summary ready: $OUT"
if [ -n "$NTFY_TOPIC" ]; then   # phone push: just the short block, not the full report
  PHONE=$(sed -n '/^## Phone summary/,$p' "$OUT" | sed 1d | head -c 600)
  [ -z "$PHONE" ] && PHONE="Summary ready in ~/hq/$OUT"
  curl -s -m 15 -H "Title: Claude + Codex ($SLOT)" -d "$PHONE" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null || echo "ntfy push failed"
fi
echo "=== exchange done $(date) ==="
