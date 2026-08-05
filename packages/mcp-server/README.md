# @prism/mcp-server

Prism's MCP server. It gives a coding agent structural answers about the local
repository — what it is, how healthy it is, how it is laid out, and what breaks
if a given file changes.

Everything is computed locally from the Prism index. The server makes no network
calls, writes nothing to your repository, and exposes no tool that could.

## Tools

| Tool | Answers | Arguments |
|---|---|---|
| `prism_repository_dna` | What is this codebase? Languages, frameworks, architecture style, domains, and the evidence behind each | — |
| `prism_repository_health` | How healthy is it? Score out of 100 with the per-factor breakdown | — |
| `prism_repository_map` | How is it laid out? Nodes, edges and regions at a zoom level | `zoom`, `layers` |
| `prism_blast_radius` | What breaks if I change this? Dependents, risk lanes and evidence | `kind`, `id`, `path`, `intent` |
| `prism_backend_report` | What does the server side look like? Endpoints, auth, data layer, env, jobs | `packageId` |

All five are read-only and closed-world, and say so in their annotations, so an
agent can call them without asking the user first.

## Setup

Build once from the repository root:

```bash
bun install
bun run build
```

The server is launched as `node <repo>/packages/mcp-server/dist/bin.js`.

### Cursor

`~/.cursor/mcp.json`, or `.cursor/mcp.json` inside a project:

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["/absolute/path/to/Prism/packages/mcp-server/dist/bin.js"],
      "env": {
        "PRISM_WORKSPACE": "/absolute/path/to/the/repository/to/analyse"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add prism -- node /absolute/path/to/Prism/packages/mcp-server/dist/bin.js
```

Claude Code launches the server in your project directory, so `PRISM_WORKSPACE`
is optional there — the working directory is used.

## Which repository does it analyse?

Most explicit wins:

1. `--workspace <path>` (or `-w`, or the first positional argument)
2. `PRISM_WORKSPACE`
3. The working directory the server was launched in

Relative paths resolve against the working directory.

## Behaviour worth knowing

**The first tool call is slower than the rest.** The workspace is opened and
indexed on first use, not during the handshake — a handshake that indexed would
make every client think the server had hung. Later calls reuse the open
workspace, so an agent calling six tools indexes once.

**Failures come back in-band.** A tool that fails returns `isError: true` with a
message beginning with the Prism error code (`PRISM_INVALID_PATH: …`), so a
model can read the failure and react rather than the request simply vanishing.

**Nothing consent-gated is exposed.** Prism's network integrations and its
build- and test-spawning paths require explicit user consent, and an agent
asking on the user's behalf is not the user asking. Those Core methods are
deliberately unreachable from MCP ([ADR-0024](../../plans/adr/0024-opt-in-network-integrations.md));
a test enforces it.

**stdout is protocol-only.** Diagnostics go to stderr, where MCP clients surface
them as server logs. A test asserts that nothing in this package writes to
stdout.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `PRISM_INVALID_PATH: Workspace path is not readable` | `PRISM_WORKSPACE` points somewhere that does not exist, or the launcher's working directory is not the repository |
| First call takes several seconds | Expected: that call is building the index. Subsequent calls are fast |
| Client reports a JSON parse error | Something wrote to stdout. Nothing in this package does; check for a patched dependency |

## References

- [ADR-0004](../../plans/adr/0004-core-only-integration-surface.md) — surfaces consume Core only
- [ADR-0024](../../plans/adr/0024-opt-in-network-integrations.md) — opt-in network integrations
- [ADR-0030](../../plans/adr/0030-mcp-transport-and-lifecycle.md) — transport, lifecycle, consent refusal
- [M-026](../../plans/milestones/M-026_mcp-server.md) — this milestone
