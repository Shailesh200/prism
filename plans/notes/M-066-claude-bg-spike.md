# M-066 spike — `claude --bg` as a Dispatch worker

**Status:** prepared, evidence pending (needs a machine with Claude Code signed in).
**Question:** can a supervisor-hosted background session (`claude --bg`) be a
Dispatch worker under ADR-0041/0042 rules, so jobs appear natively in
`/workflows` / `claude agents`?
**Outcome:** recorded in ADR-0046 (adopt or reject, with this evidence).
**Run:** `bash scripts/spike-claude-bg.sh` on the Claude Code machine —
throwaway, works in a temp repo, stops only what it started. The script below
is the same content, kept for reading.

## Established from the CLI reference (docs, 2026-09-01)

| Fact | Source |
|---|---|
| `--bg` starts a background session, prints the session id + management commands | `claude --bg` row |
| `--bg` **cannot** combine with `-p` (so the M-065 child stays as-is) | errors reference |
| `claude agents --json` lists active sessions; `--json --all` adds completed | `claude agents` row |
| `claude logs <id>` prints recent output; `claude stop <id>` stops; `claude respawn <id>` restarts with conversation intact | CLI reference |
| Sessions are hosted by a per-user supervisor (`claude daemon status`) | agent-view docs |
| Transcripts stay on disk and are resumable (`claude --resume`) | sessions docs |

## What still needs a live run

| # | Question | Pass means |
|---|---|---|
| Q1 | Does `--bg` accept `--tools` / `--disallowedTools` / `--bare` / `--permission-mode acceptEdits`? | Worker keeps no-shell, no-MCP, no CLAUDE.md |
| Q2 | Is the printed session id machine-readable (first line / stable format)? | The child can capture it like `agentId` |
| Q3 | Does `~/.claude/projects/<cwd-slug>/<id>.jsonl` stream tool_use/text fast enough to feed `job_logs`? | Console parity with the `-p` backend |
| Q4 | Does `claude agents --json --all` report terminal state promptly? | Finish detection without a stream |
| Q5 | Do `claude stop` / `claude respawn` map onto cancel / resume? | job_control parity |

## Script

Run on a machine with Claude Code signed in. Throwaway: works in a temp repo,
stops what it starts. Paste the output into ADR-0046.

```bash
#!/usr/bin/env bash
set -uo pipefail
dir=$(mktemp -d); cd "$dir"
git init -q -b main && echo seed > seed.txt && git add -A && git commit -qm seed

echo "== Q1: contract flags accepted? =="
out=$(claude --bg --bare --permission-mode acceptEdits \
  --tools "Read,Edit,Write,Grep,Glob,LS" --disallowedTools "Bash" \
  "Create spike.txt containing the word ok, then stop." 2>&1)
echo "$out"

echo "== Q2: session id line =="
echo "$out" | grep -iE "session|attach|logs" || true

sleep 3
echo "== agents --json (live) =="
claude agents --json || true

for i in $(seq 1 24); do [ -f spike.txt ] && break; sleep 5; done
echo "== spike.txt =="; ls -la spike.txt 2>/dev/null || echo "NOT created"

echo "== Q4: agents --json --all (terminal state) =="
claude agents --json --all || true

echo "== Q3: transcript =="
find ~/.claude/projects -name "*.jsonl" -newer seed.txt 2>/dev/null | head -3

echo "== Q5: stop / logs / respawn on the session id from Q2 =="
# claude stop <id> ; claude logs <id> ; claude respawn <id>

cd / && rm -rf "$dir"
```

## Decision rule

- **Adopt** (`workerBackend: "claude-bg"`) when Q1–Q5 all pass: jobs become
  first-class in `/workflows`, attachable with `claude attach <id>`.
- **Reject** when Q1 fails (no tool contract) or Q3/Q4 fail (no console, no
  finish signal): keep `claude -p`; statusLine + board remain the surfaces.
