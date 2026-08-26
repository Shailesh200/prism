# ADR-0038: Cursor worker credentials via SDK login, not mcp.json

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-26 |
| Decision makers | Owner, Architect |
| Related milestones | Dispatch v1 (`dispatch/v1`) |
| Extends | [ADR-0035](./0035-dispatch-vertical.md), [ADR-0037](./0037-dispatch-connect-ux.md) |

## Context

Local Dispatch jobs spawn a Cursor SDK agent (`Agent.create`). The SDK needs a
user API key. Putting `CURSOR_API_KEY` in `~/.cursor/mcp.json` forces every
user to open a dashboard, mint a key, paste a secret, and reload MCP — and the
job that asked for the key still cannot start until that reload.

Cursor already ships [`Cursor.auth.login()`](https://cursor.com/docs/sdk/typescript):
browser login mints a named user key (90 days) into `~/.cursor/sdk/auth.json`.
`Agent.create` then works without `apiKey` or `CURSOR_API_KEY`. The same
Authenticate control we use for Prism Auth (ADR-0037) is the wrong surface for
this URL: it is `cursor.com` login, and Cursor renders it as **Authenticating
prism…** (MCP tool approval) which spins forever and never opens a browser.

## Decision

1. **Users do not edit mcp.json for workers.** `init` and the first `start_job`
   call `Cursor.auth.login({ openBrowser: true })`. A Cursor login page opens
   in the system browser. The minted key stays in the Cursor SDK store on this
   machine.
2. **Do not use MCP URL elicitation for worker login.** That control is reserved
   for Prism Auth vendor grants (ADR-0037). Worker login is a Cursor website
   session, not a Prism MCP OAuth grant.
3. **Credential order:** explicit `CURSOR_API_KEY` (CI / owner override), then
   the stored SDK login, then interactive login. Never write the key into MCP
   env files.
4. **Workers inherit the running MCP binary** when this process is
   `mcp-server/dist/bin.js`, so local installs do not need `PRISM_MCP_BIN`.
5. **`@cursor/sdk` is a Dispatch dependency**, not an optional extra the user
   `bun add`s.

## Options considered

### A — `@prism init` writes `CURSOR_API_KEY` into mcp.json (rejected)

- Pros: matches how some MCP servers are configured today.
- Cons: plaintext secret; requires MCP reload; the in-flight job stays blocked;
  host-specific config paths (Cursor vs Claude vs VS Code).

### B — Cursor.auth.login via init / first start_job (chosen)

- Pros: one browser grant, takes effect in-process; no mcp.json; CI can still
  set `CURSOR_API_KEY`. Does not collide with Cursor’s “Authenticating prism…”
  MCP approval card.
- Cons: still a one-time Cursor account grant; SDK keys expire (~90 days);
  needs a display that can open a browser.

### C — Skip the SDK worker when already in a Cursor chat (deferred)

- Pros: zero extra process for “do this in this chat”.
- Cons: no background / parallel jobs; Claude hosts still need a worker.
  Revisit if in-chat jobs become the default.

## Consequences

- Positive: “start working on …” can open a Cursor login page and spawn in one
  tool call, without mcp.json.
- Negative: `init` and `start_job` must be skipped in MCP contract smoke tests
  so they do not open a real Cursor login. A Cursor host card titled
  **Authenticating prism…** with Skip is tool-approval — click Skip, not wait.
- Follow-up: Claude Code as a worker (ADR-0035); refresh/re-login when the
  minted key expires.

## Compliance

- [x] Updates package README(s) if API impacted — dispatch, mcp-server, docs
- [x] Linked from ADR-0035 / 0037
