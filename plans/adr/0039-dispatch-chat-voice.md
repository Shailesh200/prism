# ADR-0039: Canonical job ids and chat voice

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-26 |
| Decision makers | Owner, Architect |
| Related milestones | Dispatch v1 (`dispatch/v1`) |
| Extends | [ADR-0035](./0035-dispatch-vertical.md), [ADR-0038](./0038-cursor-worker-sdk-login.md) |

## Context

First-run Dispatch jobs worked, but chat still spoke like a debugger:
`job-2405972d`, worktree paths, “Cursor SDK login is stored locally”,
`0 active / 5 max`, connector counts, and API-key warnings. Users need a
name they can say (“pause audit-issues”) and a place to watch the teammate
run. They asked for that watch surface inside Cursor’s Agents window, not a
Prism webpage.

Cursor’s Agents window is Cursor’s UI. Prism cannot inject a custom
dashboard into it. Cloud SDK agents appear there under **Filter → Source →
SDK**. Local SDK agents (Dispatch v1) persist in the workspace store and
are listed with a human `name` when we pass one to `Agent.create`. That is
the only hook we have.

## Decision

1. **Canonical job id** is a ticket token (`AI-971`) or a kebab slug from
   the title (`audit-issues-in-this-repo`). Never mint `job-<hex>` for new
   jobs. Pause/resume/cancel resolve by id, slug, or unique title.
   Legacy `job-<hex>` records stay on disk; speech uses the title slug.
2. **Chat voice:** Dispatch tools return a complete `message`. The host
   agent reads that field and does not add setup trivia. User-facing copy
   never mentions API keys, mcp.json, worktree paths, `agent-` ids, host
   role, or connector counts.
3. **Agents window:** `Agent.create({ name: "Prism · {title}" })`. Chat
   tells the user to open Cursor’s Agents window and set **Filter → Source
   → SDK**. Live status in chat remains “where are we” (`list_jobs`) —
   that is the guaranteed view. We do not switch workers to cloud-only so
   they fill the default Agents list (that would leave local-first,
   ADR-0035). A Cursor-extension jobs panel or MCP App is a later option,
   not this change.

## Options considered

### A — Keep hex ids, pretty-print only (rejected)

Agents still dump `job.id` from the payload. The id must itself be speakable.

### B — Cloud workers so they always appear in Agents (rejected)

Dispatch jobs are local worktrees. Cloud VMs are a different product.

### C — Prism webpage dashboard (rejected by owner)

### D — Name local SDK agents + speakable ids (chosen)

## Consequences

- Positive: “start working on auditing…” creates `audit-issues-in-this-repo`,
  not `job-2405972d`. Init says “You're set”, not credential internals.
- Negative: local teammates may still be absent from the default Agents
  list until Cursor surfaces local SDK agents the same way as cloud.
- Follow-ups: Cursor extension jobs view if the Agents filter is not
  enough; optional MCP App for an in-chat job list.

## Compliance

- [x] Architecture docs — `docs/architecture/decisions.md`,
  `docs/mcp/dispatch.md`
- [x] Code — `@repo-prism/dispatch` job ids + voice; MCP instructions
- [ ] Master Plan — product vertical, not an Intelligence milestone
