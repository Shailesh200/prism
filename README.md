# Prism

[![npm @repo-prism/cli](https://img.shields.io/npm/v/@repo-prism/cli.svg?label=@repo-prism/cli)](https://www.npmjs.com/package/@repo-prism/cli)
[![npm @repo-prism/mcp-server](https://img.shields.io/npm/v/@repo-prism/mcp-server.svg?label=@repo-prism/mcp-server)](https://www.npmjs.com/package/@repo-prism/mcp-server)
[![VS Marketplace](https://vsmarketplacebadges.dev/version/prismhq.repo-prism.svg)](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism)
[![Open VSX](https://img.shields.io/open-vsx/v/prismhq/repo-prism)](https://open-vsx.org/extension/prismhq/repo-prism)
[![License: MIT](https://img.shields.io/github/license/Shailesh200/prism)](./LICENSE)

**Local-first Software Intelligence Engine** for humans and AI agents.

Maps, graphs, blast radius, health — on your machine. No account. Nothing uploaded for core analysis.

Prism is **not** an AI coding assistant. It is the intelligence layer behind an IDE extension, a CLI, and an MCP server that agents can call.

---

## Table of contents

1. [Get started in 60 seconds](#get-started-in-60-seconds)
2. [Install — step by step](#install--step-by-step)
   - [A. CLI](#a-cli--repo-prismcli)
   - [B. MCP (agents)](#b-mcp--repo-prismmcp-server)
   - [C. IDE extension](#c-ide-extension-repoprism)
3. [CLI — commands](#cli--commands)
4. [MCP — tools & how agents use them](#mcp--tools--how-agents-use-them)
5. [Docs](#docs)
6. [Privacy](#privacy)
7. [Build from source](#build-from-source)
8. [License](#license)

---

## Get started in 60 seconds

**Needs Node.js 26.** No need to clone this repository.

```bash
# 1) Go to your project
cd /path/to/your/project

# 2) CLI — no --workspace; uses git root from where you run
npx -y @repo-prism/cli doctor
npx -y @repo-prism/cli dna
npx -y @repo-prism/cli health

# 3) MCP once (Claude Code), then ask in plain English — no tool names:
#    claude mcp add prism -- npx -y @repo-prism/mcp-server
#    “How healthy is this repo?” / “What breaks if I change src/index.ts?”
```

| You want… | Follow |
|---|---|
| Terminal / CI | [A. CLI](#a-cli--repo-prismcli) |
| Cursor / Claude / Codex agents | [B. MCP](#b-mcp--repo-prismmcp-server) |
| Visual map & dashboards | [C. IDE extension](#c-ide-extension-repoprism) |
| Embed in code | [`@repo-prism/core`](https://www.npmjs.com/package/@repo-prism/core) |

All surfaces call the same Core SDK. None re-implements analysis.

---

## Install — step by step

### A. CLI — `@repo-prism/cli`

1. `cd` into your project.
2. Run doctor:
   ```bash
   npx -y @repo-prism/cli doctor
   ```
3. Confirm **Workspace** points at your repo (`from git root` is normal). A
   **warn** on Index cache on first run is expected.
4. Analyse:
   ```bash
   npx -y @repo-prism/cli dna
   npx -y @repo-prism/cli health
   npx -y @repo-prism/cli blast src/index.ts --fail-on high
   ```
5. Optional global install:
   ```bash
   npm install -g @repo-prism/cli
   prism doctor
   prism health --verbose   # shows workspace + index timing
   ```

Package: [npmjs.com/package/@repo-prism/cli](https://www.npmjs.com/package/@repo-prism/cli) · Guide: [`docs/cli/usage.md`](./docs/cli/usage.md)

### B. MCP — `@repo-prism/mcp-server`

**Set up once. Then ask the agent in plain language — never type tool names
like `repository_health`.** The server tells the agent which tools to call.

#### Claude Code

1. `cd /path/to/your/project`
2. `claude mcp add prism -- npx -y @repo-prism/mcp-server`
3. Restart Claude Code if it was already running.
4. Ask: “What is this repository?” or “How healthy is this codebase?”

#### Cursor

1. Open the project folder in Cursor.
2. Create `.cursor/mcp.json`:
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
3. **Settings → MCP** → enable **prism** → wait for ~28 tools.
4. In Agent chat, ask normally (no tool names).

#### Claude Desktop / Codex

Same `npx` / `@repo-prism/mcp-server` config — no `--workspace`. Full numbered
steps for every client: [`docs/mcp/install.md`](./docs/mcp/install.md).

Only add `--workspace` / `PRISM_WORKSPACE` if auto-detection picks the wrong folder.

Package: [npmjs.com/package/@repo-prism/mcp-server](https://www.npmjs.com/package/@repo-prism/mcp-server)

### C. IDE extension (RepoPrism)

1. Install **RepoPrism**:
   - **VS Code** — [Marketplace](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism) or search `RepoPrism`
   - **Cursor** — [Open VSX](https://open-vsx.org/extension/prismhq/repo-prism) or Install from VSIX
2. **Open Folder** on your project.
3. Command Palette → **Prism: Open Prism**.
4. Wait for indexing; use the UI.
5. (Cursor) Also complete [B. MCP](#b-mcp--repo-prismmcp-server) so the agent
   shares the same analysis — [`docs/ide/install.md`](./docs/ide/install.md).

---

## CLI — commands

Global flags: `-w/--workspace`, `--json`, `--no-color`, `-q/--quiet`, `--verbose`, `-y/--yes`.

Exit codes: **0** ok · **1** gated finding (`--fail-on`) · **2** usage error · **3** Prism failed.

### Diagnostics

| Command | Purpose |
|---|---|
| `prism doctor` | Environment, workspace chosen, index |
| `prism index` | Build / refresh the index |

### Understand

| Command | Purpose |
|---|---|
| `prism dna` | Languages, frameworks, domains, stack |
| `prism health` | Health score + factors |
| `prism map [--zoom repo\|package\|feature\|file\|symbol]` | Repository map |
| `prism explain <path>` | What a path is for / ownership |
| `prism explore <target>` | Usages, ownership, similar code |
| `prism stack` | Stack signals |
| `prism features` | Inferred features |
| `prism landmarks` | Entrypoints & anchors |
| `prism packages` | Workspace packages |

### Assess a change

| Command | Purpose |
|---|---|
| `prism blast <target> [--fail-on low\|mid\|high]` | Blast radius |
| `prism review [paths…] [--base <ref>]` | Change review |
| `prism safe-delete <target>` | Safe to delete? |
| `prism rename <target> <newName>` | Rename edit sites |
| `prism test-impact <target>` | Related tests |

### Structure

| Command | Purpose |
|---|---|
| `prism deps` | Graph size / hubs |
| `prism cycles [--fail-on any]` | Import cycles |
| `prism symbol <name>` | Find declaration |
| `prism refs <name>` | Find references |
| `prism route <from> <to>` | Dependency path |

### Reports

| Command | Purpose |
|---|---|
| `prism engineering` | Entropy, drift, debt, hotspots |
| `prism testing` | Suites + on-disk coverage |
| `prism security` | Left-shift checklist |
| `prism backend` | Routes, data, env, jobs |
| `prism bundle` | Bundle weight (ingested stats) |

**CI sketch:**

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "26.5.0"
- run: npx -y @repo-prism/cli review --base origin/main --fail-on high
- run: npx -y @repo-prism/cli cycles --fail-on any
```

---

## MCP — tools & how agents use them

**28 read-only tools** + **3 optional prompts** (`orient`, `before_edit`, `review_diff`).
No network. No consent APIs for agents.

**You do not type tool names.** After MCP is connected, ask in plain language —
the server’s instructions tell the agent when to call which tool.

| You say | Agent should call |
|---|---|
| “What is this repo?” | `repository_dna` / landmarks |
| “Is it healthy?” | `repository_health` |
| “What breaks if I edit `src/…`?” | `blast_radius`, `test_impact` |
| “Can I delete this?” | `safe_delete` |
| “Review my changes” | `review_changes` |

| Group | Tools |
|---|---|
| **Orientation** | `repository_dna`, `repository_health`, `repository_map`, `repository_overview`, `list_packages`, `stack_profile`, `landmarks`, `explain_area` |
| **Graphs** | `dependency_graph`, `dependency_cycles`, `knowledge_graph`, `feature_graph`, `list_features`, `find_symbol`, `find_references`, `dependency_route` |
| **Impact** | `blast_radius`, `safe_delete`, `rename_impact`, `test_impact`, `breaking_change_hints`, `review_changes`, `explore_code` |
| **Reports** | `engineering_health`, `health_history`, `backend_report`, `testing_report`, `security_report` |

Setup steps: [`docs/mcp/install.md`](./docs/mcp/install.md) · Full tool list: [`docs/reference/mcp-tools.md`](./docs/reference/mcp-tools.md).

---

## Docs

| Topic | Link |
|---|---|
| What Prism is | [`docs/start/what-is-prism.md`](./docs/start/what-is-prism.md) |
| Install | [`docs/start/install.md`](./docs/start/install.md) |
| Quickstart | [`docs/start/quickstart.md`](./docs/start/quickstart.md) |
| Capabilities overview | [`docs/reference/capabilities.md`](./docs/reference/capabilities.md) |
| Task guides | [`docs/guides/`](./docs/guides/) |
| Using the CLI | [`docs/cli/usage.md`](./docs/cli/usage.md) |
| Using MCP | [`docs/mcp/usage.md`](./docs/mcp/usage.md) |
| IDE (VS Code / Cursor) | [`docs/ide/usage.md`](./docs/ide/usage.md) |
| CLI command reference | [`docs/reference/cli-commands.md`](./docs/reference/cli-commands.md) |
| MCP tool reference | [`docs/reference/mcp-tools.md`](./docs/reference/mcp-tools.md) |
| Known limitations | [`docs/reference/known-limitations.md`](./docs/reference/known-limitations.md) |
| FAQ | [`docs/reference/faq.md`](./docs/reference/faq.md) |
| Architecture | [`docs/architecture/overview.md`](./docs/architecture/overview.md) |
| Changelog | [`CHANGELOG.md`](./CHANGELOG.md) |

Local docs site (from a clone): `bun run docs:dev`

---

## Privacy

Core analysis makes **no network requests** (proven by a trap test suite). Optional features (GitHub, PageSpeed, Gravatar, …) are **off by default** and gated per purpose in `.prism/consent.json`. Agents cannot grant consent.

→ [`PRIVACY.md`](./PRIVACY.md) · [`SECURITY.md`](./SECURITY.md)

---

## Build from source

For contributors (not required to use CLI/MCP):

```bash
git clone https://github.com/Shailesh200/prism
cd prism
nvm use          # Node 26.5.0
bun install
bun run build
bun run verify:milestone
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

Published npm packages under this org: **[`@repo-prism`](https://www.npmjs.com/org/repo-prism)** (`cli`, `mcp-server`, `core`, and engine libraries).

---

## License

[MIT](./LICENSE)
