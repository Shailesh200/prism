# ADR-0063: The Prism daemon is a process, not an agent

| | |
|---|---|
| Status | **Accepted** (owner, 2026-10-10) |
| Date | 2026-10-10 |
| Milestone | [M-095 Graph daemon](../milestones/M-095_graph-daemon.md) |
| Consistent with | [ADR-0058](./0058-prism-does-not-run-agents.md) (Prism does not run agents), [ADR-0030](./0030-mcp-transport-and-lifecycle.md) (MCP lifecycle) |
| Program | [PROGRAM_focus-reset.md](../milestones/PROGRAM_focus-reset.md) §7.1 |

## Context

Each MCP process indexes on first call. Hooks read a snapshot that can be missing or stale, which is why they print "still indexing". Two editors on one repo build two indexes. Auto-Prepare needs answers in under 300 ms. The Console daemon already has a loopback server and a workspace watcher, but it carries Dispatch.

## Decision

1. **One Prism daemon per machine**, lifted from `dispatch-hub`'s server and watcher into `packages/daemon`, with no Dispatch routes. It is started on demand by the session hook or `prism graph serve`, holds a single-instance lock, and stops after an idle period.
2. **It indexes, watches and answers. It never edits files, never runs a model, never runs jobs.**
3. **Attach-first.** MCP, CLI and hooks query the daemon over loopback and fall back to in-process Core when it is absent or the versions differ.
4. **Fresh.** File-system events drive incremental reindex. Git hooks are installed only on explicit request. The hook snapshot is rewritten on every reindex.
5. **Limits and safety.** Memory cap, nice level, battery pause, loopback-only bind, per-user token file (0600). Covered by the no-network suite.

## Consequences

- No cold index per MCP process; one cache per repository.
- One more long-running local process, which is why the caps, idle stop and `prism graph stop` exist.

## Implementation notes (M-095)

- **Attach is by tool name, not a Core proxy.** The daemon runs as `prism-mcp --daemon` and serves the same tool definitions the MCP server registers. Many `PrismWorkspace` reads are synchronous, so a remote proxy of Core methods would have changed every tool. An answer from the daemon is byte-for-byte what the in-process path returns (tested).
- **`packages/daemon`** holds the generic parts: single-instance lock, the 0600 record (`~/.prism/daemon/daemon.json`), the loopback server, the client, the workspace pool and watcher, and the limits. The client lives there rather than in Core, so Core's analysis paths still open no sockets, loopback included.
- **Who starts it.** The session hook, `prism graph serve`, and every MCP server at startup. Cursor may not run the session hook, and attach-first only helps if something starts the daemon.
- **Version handshake.** The build id is the package version plus the build time of the server's own code, so `dev:link` rebuilds without a version bump still replace a stale daemon. A mismatch answers 409; the client falls back in-process and `ensureDaemon` replaces the old daemon.
- **Refused:** any request with an `Origin` header (no browser has a reason to call it), a non-loopback `Host`, or a missing or wrong token.
- **Watch-driven reindex** merges against the snapshot already in memory instead of re-reading and re-validating every cached row; on-disk data is still validated on first load. Health history is written on full runs only, not on every save.
