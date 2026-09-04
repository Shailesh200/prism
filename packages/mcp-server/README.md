# @repo-prism/mcp-server

[![npm](https://img.shields.io/npm/v/@repo-prism/mcp-server.svg)](https://www.npmjs.com/package/@repo-prism/mcp-server)
[![license](https://img.shields.io/npm/l/@repo-prism/mcp-server.svg)](https://github.com/Shailesh200/prism/blob/main/LICENSE)

**`prism-mcp`** — give any MCP-capable agent structural answers about the repo
you have open, plus Dispatch (start my day, jobs, connect). Same engine as the
CLI and IDE extension. Local analysis. ~40 tools.

**Website:** [https://www.prismhq.in](https://www.prismhq.in) · **Docs:** [https://www.prismhq.in/docs/start/install](https://www.prismhq.in/docs/start/install)

> Requires **Node.js 26**.

**You never type tool names.** After setup, ask in plain language (“is this repo
healthy?”, “start my day”, “connect Slack”). The server instructs the agent
which tools to call.

---

## Setup — step by step

**No `--workspace` path.** After connect the server asks the client for MCP
**roots** (the folder you have open in chat). It also honours
`WORKSPACE_FOLDER_PATHS` and then walks up from the process cwd to the nearest
**git root**.

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
5. Wait until ~**40 tools** appear.
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
3. MCP `roots/list` from the client (the folder you are chatting in)
4. Host `WORKSPACE_FOLDER_PATHS` (Cursor / VS Code open folders)
5. Nearest ancestor of cwd with `.git`
6. Git root from `VSCODE_CWD` / `INIT_CWD`
7. Process cwd

---

## How to talk to the agent

| You say | Agent should call |
|---|---|
| “What is this repo?” / “Orient me” | `repository_dna`, landmarks / overview |
| “Is this codebase healthy?” | `repository_health` |
| “What breaks if I edit `src/…`?” | `blast_radius`, `test_impact` |
| “Can I delete this?” | `safe_delete` |
| “Review my changes” | `review_changes` (omit paths to auto-discover) |
| “What changed?” | `changed_paths` |
| “Is the index ready?” | `workspace_status` |
| “Can Prism do X?” | `capabilities` |
| “Start my day” | `start_my_day` |
| Any request to change code (“fix the news tab highlighting”) | `start_job` |
| The same request plus “do it now” / “right here” | no job — inline edit |
| “Prism init” / set up jobs | `init` |
| “Where are we?” | `list_jobs` |
| “What is it doing?” / “show me the logs” | `job_logs` |
| “Remember this” | `remember` |
| “Configure Dispatch” | `configure` |

Optional MCP **prompts** (picker / slash in some clients): `orient`,
`before_edit`, `review_diff`, `start_my_day`, `start_work`, `where_are_we`,
`connect`, `configure`, `init`.

Say **prism init** to set up local workers. The worker matches your host:
Cursor signs in via a browser page; Claude Code reuses the `claude` CLI
sign-in. Do not paste `CURSOR_API_KEY` into mcp.json — it is only an optional
CI override. Dispatch docs:
see the public [Dispatch guide](https://www.prismhq.in/docs/guides/dispatch).

MCP **resources** (for clients that bind context): `prism://dna`,
`prism://landmarks`, `prism://health`.

---

## CI vs MCP

| Surface | Use it for |
|---|---|
| **CLI** (`@repo-prism/cli`) | Gates and scripts — exit codes, JSON for CI jobs, `prism health`, `prism review`, thresholds that fail a build |
| **MCP** (this package) | Interactive agent queries — orient, blast radius, review a working tree, explore symbols while chatting |

Do **not** drive CI pass/fail from MCP tool calls. Agents are non-deterministic about which tools they pick; the CLI is the stable gate. Install both when you want agents in the IDE and the same engine in pipelines.

---

## Install globally (optional)

```bash
npm install -g @repo-prism/mcp-server
# then use "command": "prism-mcp" instead of npx in configs
```

## MCP Registry

Manifest prepared for owner submission: [`server.json`](./server.json) ·
[`REGISTRY.md`](./REGISTRY.md) · copy-paste config [`mcp-install.json`](./mcp-install.json).

---

## Tools

Intelligence tools are read-only. Dispatch tools write gitignored state under
`.prism/dispatch/`. Dispatch makes no network calls and holds no third-party
credentials — connectors belong to the agent window (ADR-0049).

### Dispatch

| Tool | Answers | Arguments |
|---|---|---|
| `start_my_day` | Standup: jobs, git, connected drivers, connect CTAs | — |
| `init` | One-time worker sign-in (Cursor browser login; Claude CLI check) | — |
| `start_job` | Start a named teammate in its own worktree; returns immediately | `title`, `prd`, `jobId`, `branch`, `confirmOverlap` |
| `list_jobs` | Live activity plus finished results (“where are we”); names the jobs board | — |
| `job_logs` | One job's console: activity lines (subagent lines marked) plus the review awaiting you | `jobId`, `limit`, `since` |
| `job_control` | pause / resume / cancel / attach_context / commit (checkout jobs) | `jobId`, `action`, `context` |
| `remember` | Save, list, or forget memories for the next job | `action`, `text`, `scope`, `confirm` |
| `configure` | Standup settings or export a non-secret template | `action`, Slack channels, `maxJobs`, `ticketHost` |
| `dispatch_doctor` | Worker backend + sign-in, role, job cap | — |

### Orientation — what is this, and how is it laid out?

| Tool | Answers | Arguments |
|---|---|---|
| `repository_dna` | Languages, frameworks, package manager, architecture hints, test runners, ranked domains | — |
| `repository_health` | Overall health 0-100 with the per-factor breakdown | — |
| `repository_map` | Structural map at a zoom level: nodes, edges, regions (default zoom `package`) | `zoom`, `layers` |
| `repository_overview` | The dashboard snapshot: totals, coupling, regions, most connected, activity | `activityDays` |
| `list_packages` | Packages in a monorepo, with roots | `limit` |
| `stack_profile` | Frameworks, runtimes and build tooling, with detection signals | `packageId` |
| `landmarks` | Entrypoints, package roots and feature anchors — where to start reading | `limit` |
| `explain_area` | What a module or folder does: domains, degree, ownership | `path` |
| `workspace_status` | Index readiness, freshness, git/cache presence, graph counts | — |
| `capabilities` | Core + consent-gated capabilities with availability reasons | — |

### Graphs and navigation

| Tool | Answers | Arguments |
|---|---|---|
| `dependency_graph` | The import graph, file-level or aggregated to packages (bounded) | `packageAggregation`, `resolveAliases`, `limit`, `summaryOnly` |
| `dependency_cycles` | Import and re-export cycles | `packageAggregation`, `limit` |
| `knowledge_graph` | Symbol declarations and the references between them | `path` or `limit` (required) |
| `feature_graph` | Inferred features and how they depend on each other (bounded) | `limit`, `summaryOnly` |
| `list_features` | Inferred features with member files and confidence | `limit` |
| `find_symbol` | Exact-name symbol lookup | `name`, `path`, `kind`, `limit` |
| `search_symbols` | Substring/regex symbol search (hard max 50) | `pattern`, `regex`, `path`, `kind`, `limit` |
| `find_references` | Who actually calls or imports a symbol | `name`, `path`, `start`, `limit` |
| `dependency_route` | How one file or symbol reaches another | `from`, `to`, `maxAlternatives`, `maxHops` |

### Impact — is this change safe?

| Tool | Answers | Arguments |
|---|---|---|
| `blast_radius` | What depends on this, and how risky is changing it | `kind`, `id`, `path`, `intent`, `limit` |
| `safe_delete` | Can this be deleted? Blockers and files left orphaned | `kind`, `id`, `path` |
| `rename_impact` | Every edit site a rename would touch | `kind`, `id`, `path`, `newName` |
| `test_impact` | Which tests cover this change target | `kind`, `id`, `path`, `limit` |
| `breaking_change_hints` | Deprecated — included in `blast_radius` | `kind`, `id`, `path` |
| `changed_paths` | Working-tree or base-ref changed paths | `base` |
| `review_changes` | Rolled-up review; omit `paths` to auto-discover | `paths?`, `base` |

### Reports

| Tool | Answers | Arguments |
|---|---|---|
| `engineering_health` | Hotspots, churn, complexity, ownership, knowledge decay, debt | — |
| `health_history` | Health over time, with provenance on each point | `maxPoints` |
| `explore_code` | Everything about one file or symbol in one call (usages bounded) | `kind`, `path`, `name`, `start`, `limit` |
| `backend_report` | Endpoints, auth, data layer, env, background jobs | `packageId` |
| `testing_report` | Test structure, and coverage when artifacts are on disk | — |
| `security_report` | Left-shift security posture against local configuration | — |

Full reference: [MCP tools](https://www.prismhq.in/docs/reference/mcp-tools).

---

## Related

| | |
|---|---|
| **CLI** | [`@repo-prism/cli`](https://www.npmjs.com/package/@repo-prism/cli) — `npm i -g @repo-prism/cli` then `prism health` |
| **IDE** | [Prism](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism) |
| **Docs** | [MCP guide](https://www.prismhq.in/docs/start/install) |
| **Website** | [prismhq.in](https://www.prismhq.in) |
| **Source** | [github.com/Shailesh200/prism](https://github.com/Shailesh200/prism) |

## License

[MIT](https://github.com/Shailesh200/prism/blob/main/LICENSE)
