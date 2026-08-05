# @prism/mcp-server

Prism's MCP server. It gives a coding agent structural answers about the local
repository — what it is, how healthy it is, how it is laid out, and what breaks
if a given file changes.

Everything is computed locally from the Prism index. The server makes no network
calls, writes nothing to your repository, and exposes no tool that could.

## Tools

All tools are read-only and closed-world, and say so in their annotations, so an
agent can call them without asking the user first.

### Orientation — what is this, and how is it laid out?

| Tool | Answers | Arguments |
|---|---|---|
| `repository_dna` | Languages, frameworks, package manager, architecture hints, test runners, ranked domains | — |
| `repository_health` | Overall health 0-100 with the per-factor breakdown | — |
| `repository_map` | Structural map at a zoom level: nodes, edges, regions | `zoom`, `layers` |
| `repository_overview` | The dashboard snapshot: totals, coupling, regions, most connected, activity | `activityDays` |
| `list_packages` | Packages in a monorepo, with roots | `limit` |
| `stack_profile` | Frameworks, runtimes and build tooling, with detection signals | `packageId` |
| `landmarks` | Entrypoints, package roots and feature anchors — where to start reading | `limit` |
| `explain_area` | What a module or folder does: domains, degree, ownership | `path` |

### Graphs and navigation

| Tool | Answers | Arguments |
|---|---|---|
| `dependency_graph` | The import graph, file-level or aggregated to packages | `packageAggregation`, `resolveAliases` |
| `dependency_cycles` | Import and re-export cycles | `packageAggregation`, `limit` |
| `knowledge_graph` | Symbol declarations and the references between them | — |
| `feature_graph` | Inferred features and how they depend on each other | — |
| `list_features` | Inferred features with member files and confidence | `limit` |
| `find_symbol` | Where a symbol is declared | `name`, `path`, `kind`, `limit` |
| `find_references` | Who actually calls or imports a symbol | `name`, `path`, `start`, `limit` |
| `dependency_route` | How one file or symbol reaches another | `from`, `to`, `maxAlternatives`, `maxHops` |

### Impact — is this change safe?

| Tool | Answers | Arguments |
|---|---|---|
| `blast_radius` | What depends on this, and how risky is changing it | `kind`, `id`, `path`, `intent` |
| `safe_delete` | Can this be deleted? Blockers and files left orphaned | `kind`, `id`, `path` |
| `rename_impact` | Every edit site a rename would touch | `kind`, `id`, `path`, `newName` |
| `test_impact` | Which tests cover this change target | `kind`, `id`, `path` |
| `breaking_change_hints` | What a change here could break for consumers | `kind`, `id`, `path` |
| `review_changes` | All of the above for a set of changed paths, rolled up | `paths`, `base` |

### Reports

| Tool | Answers | Arguments |
|---|---|---|
| `engineering_health` | Hotspots, churn, complexity, ownership, knowledge decay, debt | — |
| `health_history` | Health over time, with provenance on each point | `maxPoints` |
| `explore_code` | Everything about one file or symbol in one call | `kind`, `path`, `name`, `start` |
| `backend_report` | Endpoints, auth, data layer, env, background jobs | `packageId` |
| `testing_report` | Test structure, and coverage when artifacts are on disk | — |
| `security_report` | Left-shift security posture against local configuration | — |

### Not included

`architecture_rules` appears in Prism's older planning documents. No rules engine
exists, so the tool is not here rather than being faked; building one is a
product decision, not an adapter task.

`domain_report` waits on `getDomainReport`, which moved to M-053.

### Output bounds

Every tool taking `limit` returns an envelope rather than a bare array:

```json
{ "items": [], "totalCount": 412, "truncated": true, "limit": 50 }
```

The default limit is 50 and the maximum is 500. `totalCount` and `truncated`
are always present, because a silently truncated list is worse than a long one —
an agent concludes the missing items do not exist.

### Path arguments

Paths are workspace-relative. Absolute paths are accepted when they land inside
the workspace, since an agent reading a stack trace legitimately holds one.
Anything that escapes the workspace root is rejected with `PRISM_INVALID_PATH`.

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
