#!/usr/bin/env bash
# M-066 spike: can `claude --bg` be a Dispatch worker? (ADR-0046 evidence)
#
# Run on a machine with Claude Code signed in:
#   bash scripts/spike-claude-bg.sh
#
# Throwaway by design: works in a temp repo, stops only the session it
# started, and never touches the shared supervisor (claude daemon) beyond
# what one --bg session does. Paste the full output back for the ADR.

set -uo pipefail

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH. Install Claude Code and sign in first."
  exit 1
fi

dir=$(mktemp -d)
echo "== spike repo: $dir =="
cd "$dir"
git init -q -b main
echo seed > seed.txt
git add -A && git commit -qm seed

echo
echo "== Q1: does --bg accept the worker contract flags? =="
out=$(claude --bg --bare --permission-mode acceptEdits \
  --tools "Read,Edit,Write,Grep,Glob,LS" --disallowedTools "Bash" \
  "Create a file called spike.txt containing the word ok, then stop." 2>&1)
echo "$out"

echo
echo "== Q2: session id in that output? (expect a hex id + attach/logs hints) =="
id=$(echo "$out" | grep -oE '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{8}' | head -1 || true)
echo "captured id: ${id:-<none — read the output above>}"

sleep 3
echo
echo "== agents --json (live sessions) =="
claude agents --json 2>&1 || true

echo
echo "== waiting for spike.txt (up to 2 min) =="
for _ in $(seq 1 24); do
  [ -f spike.txt ] && break
  sleep 5
done
if [ -f spike.txt ]; then
  echo "spike.txt created: $(cat spike.txt)"
else
  echo "spike.txt NOT created — Q1 likely failed (tool contract rejected?)"
fi

echo
echo "== Q4: agents --json --all (terminal state visible?) =="
claude agents --json --all 2>&1 || true

echo
echo "== Q3: transcript streaming to ~/.claude/projects? =="
find ~/.claude/projects -name "*.jsonl" -newer seed.txt 2>/dev/null | head -3 || echo "no transcript found"

if [ -n "${id:-}" ]; then
  echo
  echo "== Q5: logs / stop on $id =="
  claude logs "$id" 2>&1 | head -20 || true
  claude stop "$id" 2>&1 || true
else
  echo
  echo "== Q5: skipped (no session id captured) — run claude agents, then: =="
  echo "   claude logs <id> / claude stop <id> / claude respawn <id>"
fi

cd /
rm -rf "$dir"
echo
echo "== spike done. Paste everything above into the chat for ADR-0046. =="
