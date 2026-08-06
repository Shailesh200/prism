# @repo-prism/mcp-server

[![npm](https://img.shields.io/npm/v/@repo-prism/mcp-server.svg)](https://www.npmjs.com/package/@repo-prism/mcp-server)
[![license](https://img.shields.io/npm/l/@repo-prism/mcp-server.svg)](https://github.com/Shailesh200/prism/blob/main/LICENSE)

**`prism-mcp`** — give any MCP-capable agent structural answers about the repo
you have open. Same engine as the CLI and IDE extension. Local-only. 28 tools.

> Requires **Node.js 26**.

**You never type tool names.** After setup, ask in plain language (“is this repo
healthy?”, “what breaks if I change auth?”). The server instructs the agent
which tools to call.

---

## Setup — step by step

**No `--workspace` path.** The server uses the client’s working directory, then
walks up to the nearest **git root** (same as the CLI).

### Claude Code

1. Open a terminal in your project: `cd /path/to/your/project`
2. Run:
   ```bash
   claude mcp add prism -- npx -y @repo-prism/mcp-server
   ```
3. Restart Claude Code if it was already open.
4. Ask: “What is this repository?” or “How healthy is this codebase?”
5. Confirm the agent calls Prism tools on its own (you should not need to name them).

### Cursor

1. Open your project folder in Cursor.
2. Create `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):
   ```json
   {
     "mcpServers": {
       "prism": {
         "command": "npx",
         "args": ["-y", "@repo-prism/mcp-server"]
       }
     }
   }
   ```
3. Save the file.
4. **Settings → MCP** → enable **prism**.
5. Wait until ~**28 tools** appear.
6. In Agent chat, ask in plain language — no tool names.

### Claude Desktop

1. Edit `claude_desktop_config.json`
   (macOS: `~/Library/Application Support/Claude/` · Windows: `%APPDATA%\Claude\`).
2. Add:
   ```json
   {
     "mcpServers": {
       "prism": {
         "command": "npx",
         "args": ["-y", "@repo-prism/mcp-server"]
       }
     }
   }
   ```
3. Quit and reopen Claude Desktop.
4. Start from / with your project so the server cwd is that project
   (or set `env.PRISM_WORKSPACE` once if the client always starts from a fixed dir).
5. Ask in plain language.

### Codex CLI

1. Edit `~/.codex/config.toml`.
2. Add:
   ```toml
   [mcp_servers.prism]
   command = "npx"
   args = ["-y", "@repo-prism/mcp-server"]
   ```
3. Run Codex from inside your project.
4. Ask in plain language.

### Optional overrides

Only if auto-detection is wrong:

```bash
npx -y @repo-prism/mcp-server --workspace /path/to/repo
# or
PRISM_WORKSPACE=/path/to/repo npx -y @repo-prism/mcp-server
```

**Do not** leave a terminal on `ready on stdio` — that means the server is
waiting for an MCP **client**. Configure the client; it starts the process.

### Workspace resolution

1. `--workspace <path>` (or `-w`, or first positional)
2. `PRISM_WORKSPACE`
3. Nearest ancestor of cwd with `.git`
4. Process cwd

---

## How to talk to the agent

| You say | Agent should call |
|---|---|
| “What is this repo?” / “Orient me” | `repository_dna`, landmarks / overview |
| “Is this codebase healthy?” | `repository_health` |
| “What breaks if I edit `src/…`?” | `blast_radius`, `test_impact` |
| “Can I delete this?” | `safe_delete` |
| “Review my changes” | `review_changes` |

Optional MCP **prompts** (picker / slash in some clients): `orient`,
`before_edit`, `review_diff`.

---

## Install globally (optional)

```bash
npm install -g @repo-prism/mcp-server
# then use "command": "prism-mcp" instead of npx in configs
```

---

## Tools

All tools are read-only. No tool grants consent or reaches the network.

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

Full reference: [MCP tools](https://github.com/Shailesh200/prism/blob/main/docs/reference/mcp-tools.md).

---

## Related

| | |
|---|---|
| **CLI** | [`@repo-prism/cli`](https://www.npmjs.com/package/@repo-prism/cli) — `npm i -g @repo-prism/cli` then `prism health` |
| **IDE** | [Prism](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism) |
| **Docs** | [MCP guide (step by step)](https://github.com/Shailesh200/prism/blob/main/docs/mcp/install.md) |
| **Source** | [github.com/Shailesh200/prism](https://github.com/Shailesh200/prism) |

## License

[MIT](https://github.com/Shailesh200/prism/blob/main/LICENSE)
