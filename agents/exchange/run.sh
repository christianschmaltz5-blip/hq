#!/bin/bash
# Claude + Codex exchange, morning and evening. Codex advises (read-only), Claude checks it against the code,
# Codex debriefs on Claude's draft, Claude writes the final best-of-both to agents/exchange/YYYY-MM-DD-am|pm.md
# and pushes a short summary to the phone. The exchange itself is read-only; the morning run then applies the
# top 3 actions (apply step below), gated by tests and a personal-data scan before commit + push.
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

# --- Daily apply step (am only): implement the top 3 actions, test, scan, commit, push ---
if [ "$SLOT" = am ]; then
  pyfail() { python3 -m unittest discover -s tests -p 'test_*.py' 2>&1 | grep -oE 'FAILED \([^)]*\)' || echo ok; }   # compare to baseline so a pre-existing failure can't block every run
  PY0=$(pyfail)
  BASE=$(git diff --name-only; git diff --cached --name-only)
  claude -p --model sonnet --permission-mode default \
    --allowedTools "Read,Grep,Glob,Edit,Write,Bash(node --test:*),Bash(python3 -m unittest:*),Bash(git diff:*),Bash(git log:*)" 2>>/tmp/hq-exchange.log <<EOP
Read AGENTS.md and $OUT. Implement the top 3 recommended actions from that summary in the site files. Rules: smallest working change; edit existing files, create none (except tests); never add phone numbers, emails, owner names or any personal data; never touch contacts.enc.json, .env files, agents/*/geocode_cache.json or agents/exchange/*; do not run git commit or git push. Skip any action you cannot verify against the code or that needs a login, a paid service or a judgment call, and say so. Run both test suites in tests/README.md at the end. Reply with 3 short lines: what changed, what was skipped, test result.
EOP
  CHANGED=$(comm -13 <(printf '%s\n' "$BASE" | sort -u) <(git diff --name-only | sort -u) | grep -v -E 'geocode_cache|contacts\.enc|\.env|^agents/exchange/')
  if [ -n "$CHANGED" ]; then
    if node --test tests/underwriting.test.mjs >/dev/null 2>&1 && [ "$(pyfail)" = "$PY0" ] \
       && ! git diff -- $CHANGED | grep -E '^\+' | grep -qE '\(?[0-9]{3}\)?[ .-][0-9]{3}[ .-][0-9]{4}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}'; then
      git add -- $CHANGED && git commit -qm "Daily exchange: apply top actions ($(date +%F))" && git push -q \
        && notify "Applied + pushed: $(echo $CHANGED | wc -w) file(s)" || notify "Apply commit/push FAILED, see /tmp/hq-exchange.log"
    else
      git checkout -- $CHANGED; notify "Apply BLOCKED (tests or personal-data scan); changes reverted"
    fi
  fi
fi

notify "$SLOT summary ready: $OUT"
if [ -n "$NTFY_TOPIC" ]; then   # phone push: just the short block, not the full report
  PHONE=$(sed -n '/^## Phone summary/,$p' "$OUT" | sed 1d | head -c 600)
  [ -z "$PHONE" ] && PHONE="Summary ready in ~/hq/$OUT"
  curl -s -m 15 -H "Title: Claude + Codex ($SLOT)" -d "$PHONE" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null || echo "ntfy push failed"
fi
echo "=== exchange done $(date) ==="
