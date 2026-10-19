# M-095 — Graph daemon

| Field | Value |
|---|---|
| Status | **Built, not verified** — B5 freshness and medium-repo memory open (round 4) |
| Branch | `milestone/M-095-graph-daemon` (from latest `main`) |
| Depends on | ~~M-094 Verified~~ M-093 (M-094 obsolete) |
| Unlocks | M-096 |
| Packages | new `packages/daemon` (lifted from `dispatch-hub` server + `watch.ts`), `core` (attach client), `mcp-server` / `cli` (attach-first), `plugin` (session hook starts daemon), `indexer` (incremental path) |
| ADR | [ADR-0063](../adr/0063-prism-daemon-is-a-process.md) |


## Status (17 Oct 2026)

- **Built:**
  - `packages/daemon`, with attach-first MCP and the hooks.
  - `prism graph status|serve|stop|refresh|map|export`.
  - The warm daemon keeps hooks under 1 s (B8 round 3: prompt 896 ms, stop 508 ms p95).
- **Deleted in 2.0:** the git-hook writer (`prism graph hooks`, unified plan §0.4 #37).
- **Round 4 (running):**
  - The B5 freshness benchmark (`scripts/bench/daemon-freshness.mjs`), not run since round 2.
  - Medium-repo peak memory: round 3 measured 1.56 GB, against 1.02 GB before (ceiling 1.72 GB). The round 4 check at 04:04 IST found no regression on the current tree: 0.79 / 0.95 GB on Node 24, against 1.16 GB on Node 23. The release gate still has to confirm it.

## 1. Goal

One local background process keeps every open repository's graph fresh, and every surface asks it first. There is no more cold index per MCP process and no more "still indexing" on a known repo. Program §7.1.

## 2. In scope

| Item | Detail |
|---|---|
| Lift | Move the loopback server, auth token and workspace watcher from `dispatch-hub` into `packages/daemon`, without Dispatch routes |
| Lifecycle | Started by the session hook or `prism graph serve`; single instance per machine (lock file under `~/.prism`); idle stop after a configurable period; `prism graph status` / `stop` |
| Freshness | FS events → incremental reindex (M-035 path), debounced; optional git hooks `post-checkout`, `post-merge`, `post-commit` (installed only by `prism graph hooks install`, never silently); snapshot rewritten on each reindex |
| Attach-first | Core gets a small client: MCP and CLI query the daemon over loopback; fall back to in-process Core when it is absent or the versions differ |
| Limits | Memory cap, nice level, battery pause below 20% (Q-8), set in one config file under `~/.prism` |
| Security | Loopback only, per-user token file mode 0600, no remote bind; covered by the M-036 no-network suite |
| Auto-Prepare | The prompt-submit hook switches to the daemon; target ≤ 300 ms p95 |

## 3. Out of scope

- New graph node kinds and the artifact (M-096). HTTP MCP (M-080, deferred).

## 4. DoD

- [x] Single-file edit reflected in the **index** within 1s p95 at 10k files: 268 ms p95 (`08_PERFORMANCE.md`). A **symbol answer** for the new code takes 2.3 s p95 at 10k (355 ms at 1k): open, needs the incremental symbol graph
- [ ] First `prepare_change` with a warm daemon < 1s (met: 786 ms p50 at 10k, 42 ms at 1k); auto-Prepare p95 ≤ 300 ms met at 1k (53 ms), **not at 10k (1.7 s)**: open
- [x] Killing the daemon mid-session: MCP falls back in-process with no error to the agent (`mcp-server/src/daemon.test.ts`)
- [x] Two MCP clients on one repo share one index: one open and one index for two callers (`daemon/src/server.test.ts`)
- [x] No-network: every socket is loopback while indexing, watching and answering, and nothing accepts on a non-loopback address (`daemon/src/no-network.test.ts`)
- [ ] Claude Code smoke: new session shows orientation immediately; transcript saved
- [ ] `verify:milestone` green
- [ ] Owner review → commit → merge → Verified → snippet

## 7. Implementation status (one-pass build on the M-087 branch)

Built: `packages/daemon` (lock, 0600 record, loopback server, client, workspace pool with recursive `fs.watch`, idle stop, memory cap, nice level, battery pause), `prism-mcp --daemon`, attach-first tool calls in the MCP server, daemon-first auto-Prepare, daemon start from the session hook and from every MCP server, `prism graph status | serve | stop | refresh | hooks install | uninstall`, and the `scripts/bench/daemon-freshness.mjs` harness. Design notes are in ADR-0063. The CLI's analysis commands still run in-process; only `prism graph` talks to the daemon.

## 5. Verification

`bun run verify:milestone` · perf budgets in CI (`bench.yml`) · smoke `plans/notes/smoke/M-095.md`.

## 6. Risks

Background CPU or memory use on large repos is handled with the caps, battery pause and idle stop above. Stale daemon versions after `dev:link`: version handshake, and a mismatch restarts the daemon.
