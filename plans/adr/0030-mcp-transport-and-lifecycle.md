# ADR-0030: MCP transport, workspace lifecycle and consent refusal

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-08-05 |
| Decision makers | Owner, Architect |
| Related milestones | **M-026** (implementation), M-027, M-039 |
| Related | [ADR-0004](./0004-core-only-integration-surface.md), [ADR-0019](./0019-core-sdk-versioning.md), [ADR-0024](./0024-opt-in-network-integrations.md) |

## Context

`@prism/mcp-server` is Prism's first non-human surface. Everything shipped so far has been read by
a person who can see a spinner, judge a stale number and decide whether to trust it. An agent has
none of that. It sees a tool list, a schema and a blob of JSON, and it acts.

That changes which decisions matter. Four had to be made before the first tool could ship.

## Decision

### 1. stdio only

The transport is stdio. No HTTP, no SSE.

Cursor and Claude Code both launch MCP servers as subprocesses and speak stdio. A remote transport
solves a problem nobody has yet — and shipping both would double the surface area of the thing most
likely to break, for zero users. If a remote case appears, it gets its own ADR.

The consequence is a rule the code has to obey: **stdout carries protocol frames and nothing else**.
A single `console.log` anywhere in the process corrupts the stream, and the client reports a parse
error rather than whatever was being logged — the worst kind of bug, because the message that would
explain it is the message that caused it. All diagnostics go to stderr, and a test asserts that
nothing in the package writes to stdout.

### 2. One workspace per process, opened lazily, indexed once

The workspace is resolved at startup but opened on the **first tool call**, never during
`initialize`.

Indexing is the expensive thing Prism does. Doing it during the handshake would mean every client
waits seconds before the server appears at all, which reads as a hung or broken server rather than a
working one. Doing it on first use means the first tool call is slow and every later one is fast —
visible, explicable, and attributable to a specific call the agent made.

The open workspace is then reused for the life of the process, so an agent calling six tools indexes
once. Concurrent first calls await a single shared index rather than racing into several.

A failed open is **not** memoised. The server is long-lived; one transient failure must not make
every subsequent call fail for the rest of the session.

### 3. Workspace resolution: argument → environment → cwd

Most explicit wins. An agent launches us with a working directory we did not choose, so inferring
from cwd is the last resort rather than the default. Relative paths resolve against cwd instead of
being rejected — an agent passing `.` means the directory it launched us in, and refusing that would
be pedantry rather than safety.

### 4. Consent-gated paths are refused, not proxied

This is the decision worth arguing about, and it is deliberate.

Prism's promise ([ADR-0024](./0024-opt-in-network-integrations.md)) is that nothing reaches the
network and nothing spawns a build or a test run unless the user asks for it. An agent asking on the
user's behalf **is not the user asking**. The agent has no way to obtain informed consent, and a
consent prompt answered by a model is not consent.

So the consent-gated Core methods — remote DevOps staging, utility jobs, test runs, bundle analysis —
are simply not reachable from MCP. Not gated behind a flag, not proxied with a warning: absent. A
test enumerates them and fails if any registered tool calls one, because the temptation to add "just
one" will be strongest in M-027 when the tool list grows.

### 5. Errors: JSON-RPC code for the class, Prism code for the specifics

Core's `PrismErrorCode` has thirteen members; JSON-RPC has a handful. Rather than flatten Prism's
codes away, each maps to the JSON-RPC code that describes what an agent should *do*:

- `InvalidParams` — you asked wrongly; asking again the same way will fail the same way
- `InternalError` — we failed; retrying is not unreasonable

That distinction is the only thing an agent can act on automatically. The specific Prism code is
preserved as the message prefix (`PRISM_INVALID_PATH: …`) so both the model and the human reading
the transcript keep the detail. The mapping is a total table rather than a default, so adding a
`PrismErrorCode` forces a decision instead of silently becoming an internal error.

Tool failures surface in-band as `isError: true` per the MCP specification, so the model can read
and react to them. Protocol-level problems stay protocol-level.

### 6. DTOs pass through unmodified

Tools return `@prism/shared` DTOs exactly as Core produces them. No reshaping, no flattening, no
"friendlier" adapter shape.

The MCP contract *is* the Core contract. A tool that reshapes is a second contract to keep in sync,
and the moment it drifts the agent and the IDE give different answers for the same repository —
precisely the failure [ADR-0004](./0004-core-only-integration-surface.md) exists to prevent, only now
frozen into a public tool contract.

## Consequences

**Good**

- The handshake is fast regardless of repository size.
- An agent and the IDE cannot diverge, because they read the same DTOs from the same Core.
- The privacy promise holds without the user having to trust the agent.
- Adding a tool is declaring a name, a description, a schema and a Core call. Nothing else.

**Costs**

- The first tool call is slow, and no amount of documentation stops that from occasionally looking
  like a hang. M-035 owns any budget work here.
- Agents cannot use Prism's consent-gated capabilities at all. Some legitimate agent workflows —
  "run the tests and tell me what broke" — are therefore out of reach through Prism. That is the
  intended trade.
- stdio only means no remote or multi-client scenario without a new ADR.

**Deferred**

- HTTP/SSE transport.
- Multi-workspace sessions and switching workspace mid-session.
- MCP resources and prompts. Tools first; the others only if a real client needs them.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Index during `initialize` | A slow handshake is indistinguishable from a broken server |
| Index per tool call | An agent calling six tools would index six times |
| Expose consent-gated tools with a warning in the description | A warning in a description is not consent, and the model is not the user |
| Flatten all errors to `InternalError` | Removes the only signal an agent can act on |
| Adapter-shaped DTOs "friendlier" than Core's | A second contract that drifts, producing two answers for one repository |
| Ship stdio and HTTP together | Doubles the surface for no current user |
