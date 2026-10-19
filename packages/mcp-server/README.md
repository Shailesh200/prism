# @prismapp/mcp-server

**`prism-mcp`**: structural answers about the repository you have open, for
any MCP-capable coding agent. Local analysis only: no network calls, no
credentials, no model calls. TypeScript and JavaScript repositories.

> Requires **Node.js 24 LTS** or newer.

You never type tool names. Ask in plain language ("what breaks if I change
this?", "review my changes"); the server tells the agent which tools to call.

## Setup

Install the CLI, then let it write the editor configuration:

```bash
npm install -g @prismapp/cli
prism install claude     # or: cursor, codex, opencode, all
```

`prism install` writes the MCP entry, the hooks or the rule line for that
editor, and records what it wrote in `~/.prism/install.json` so
`prism uninstall` can remove exactly that. `prism doctor` checks the result.

### Workspace resolution

The workspace is the git root of, in order: the file being edited, the
client's MCP roots or working directory, then `PRISM_WORKSPACE`.

## Tools

Every tool is read-only and makes no network call.

### Default (always registered)

| Tool | Answers | Arguments |
|---|---|---|
| `prepare_change` | The pack for a task: files to read, reuse candidates, house style, notes, and the work order (in scope, off-limits, needs sign-off). Never file bodies | `task`, `budget` |
| `blast_radius` | What depends on this, and how risky is changing it | `kind`, `id`, `path`, `intent`, `limit` |
| `test_impact` | Which tests reach this change target | `kind`, `id`, `path`, `limit` |
| `habits` | The user's saved routines; with a name, the ordered steps and output format | `name?` |
| `safe_delete` | Can this be deleted? Blockers and files left orphaned | `kind`, `id`, `path` |
| `rename_impact` | Every edit site a rename would touch | `kind`, `id`, `path`, `newName` |
| `guard_session` | The current dirty session ranked by blast risk | `preExistingChanges` |
| `repository_overview` | What this repository is: languages, frameworks, stack, and the landmarks to open first | `packageId`, `limit` |
| `graph` | One structural question: `find`, `search`, `refs`, `neighbors`, `path`, `explain`, or `query`. Bounded by `budget` | `mode` + that mode's fields, `budget` |

### Opt-in

List any of these in `~/.prism/config.json` to register them:

```json
{ "extraTools": ["dependency_cycles", "explore_code"] }
```

An unknown name is reported on stderr and by `prism doctor`.

| Tool | Answers | Arguments |
|---|---|---|
| `dependency_graph` | The import graph, file-level or aggregated to packages (bounded) | `packageAggregation`, `resolveAliases`, `limit`, `summaryOnly` |
| `knowledge_graph` | Symbol declarations and the references between them | `path` or `limit` (required) |
| `dependency_cycles` | Import cycles (value edges) | `packageAggregation`, `limit` |
| `list_packages` | Packages in a monorepo, with roots | `limit` |
| `explain_area` | What a module or folder does: degree and ownership | `path` |
| `explore_code` | Everything about one file or symbol in one call (usages bounded) | `kind`, `path`, `name`, `start`, `limit` |
| `list_findings` | Unused exports, duplicate implementations, wrapper functions | `limit`, `includeMuted` |
| `agents_md` | Generate or verify the Living AGENTS.md (cycles, tests); writes only under `~/.prism` | `action` |
| `workspace_status` | Index readiness, freshness, git and cache presence | — |
| `capabilities` | Core capabilities with availability reasons | — |
| `receipt` | What this session changed and its verdict: SHIP, NOT PROVEN (reason + cheapest proof) or NO-SHIP; checks run in the background, same edits give the same receipt id | `sessionId` |
| `review_with` | Lens briefs and recorded verdicts. Prism does not call a model | `action`, `lenses`, `task`, `verdicts` |

MCP **resources**: `prism://dna`, `prism://landmarks`, `prism://agents-md`.

## CI vs MCP

Use the CLI (`@prismapp/cli`) and the GitHub Action for gates: exit codes
and JSON. Use MCP for interactive agent questions. Do not drive CI pass/fail
from MCP tool calls.

## License

[MIT](https://github.com/Shailesh200/prism/blob/main/LICENSE)
