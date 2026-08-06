# @repo-prism/cli

[![npm](https://img.shields.io/npm/v/@repo-prism/cli.svg)](https://www.npmjs.com/package/@repo-prism/cli)
[![license](https://img.shields.io/npm/l/@repo-prism/cli.svg)](https://github.com/Shailesh200/prism/blob/main/LICENSE)

**`prism`** — local-first repository intelligence from a terminal or CI.

Same engine as the VS Code / Cursor extension and the MCP server. Runs on your
machine. Nothing is uploaded.

> Requires **Node.js 26**.

## Setup — step by step

1. Open a terminal **inside your project**:
   ```bash
   cd /path/to/your/repo
   ```
2. Check the environment (no `--workspace` needed):
   ```bash
   npx -y @repo-prism/cli doctor
   ```
3. Read the output:
   - **Workspace** — which folder was chosen (`from git root` is normal).
   - **Index cache** — `warn` on first run is expected; the next command builds
     the index (or run `prism index` now).
4. Run analyses:
   ```bash
   npx -y @repo-prism/cli dna
   npx -y @repo-prism/cli health
   npx -y @repo-prism/cli blast src/index.ts --fail-on high
   ```
5. Optional — install globally:
   ```bash
   npm install -g @repo-prism/cli
   prism doctor
   prism health --verbose   # workspace chosen + index timing
   ```

## Global options

Work before or after the subcommand (`prism blast x --json` is fine).

| Option | Effect |
|---|---|
| `-w, --workspace <path>` | Repository to analyse |
| `--json` | JSON on stdout (scripts / CI) |
| `--no-color` | Disable ANSI colour (`NO_COLOR` honoured) |
| `-q, --quiet` | Suppress progress on stderr |
| `--verbose` | Workspace decision + index timing on stderr |
| `-y, --yes` | Consent to a gated operation |
| `-V, --version` | Core version + API level |

**Workspace resolution:** `--workspace` → `PRISM_WORKSPACE` → nearest git root → cwd.

## Exit codes

| Code | Meaning |
|---:|---|
| **0** | Success |
| **1** | Ran successfully; the analysis found what you gated on (`--fail-on`) |
| **2** | Usage error (bad flag, missing argument) |
| **3** | Prism failed |

Use **1** vs **2** carefully in CI: a typo must not look like a real finding.

## Commands

### Diagnostics

| Command | Purpose |
|---|---|
| `prism doctor` | Check Node, workspace resolution, git, index |
| `prism index` | Build or refresh the repository index |

### Understand a repository

| Command | Purpose |
|---|---|
| `prism dna` | Languages, frameworks, domains, stack |
| `prism health` | Overall health score and factors |
| `prism map [--zoom <level>]` | Map clusters / landmarks / layers (`repo`, `package`, `feature`, `file`, `symbol`) |
| `prism explain <path>` | What a file or folder is for, ownership |
| `prism explore <target>` | Usages, ownership, similar code |
| `prism stack` | Stack signals |
| `prism features` | Inferred features |
| `prism landmarks` | Entrypoints and anchors |
| `prism packages` | Workspace packages |

### Assess a change

| Command | Purpose |
|---|---|
| `prism blast <target>` | Blast radius |
| `prism review [paths…]` | Change review |
| `prism safe-delete <target>` | Safe to delete? |
| `prism rename <target> <newName>` | Rename edit sites |
| `prism test-impact <target>` | Related tests |

### Structure

| Command | Purpose |
|---|---|
| `prism deps` | Graph size / hubs |
| `prism cycles` | Import cycles |
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

## Related

| | |
|---|---|
| **MCP** | [`@repo-prism/mcp-server`](https://www.npmjs.com/package/@repo-prism/mcp-server) — one-command agent setup |
| **IDE** | [RepoPrism](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism) |
| **Docs** | [CLI guide](https://github.com/Shailesh200/prism/blob/main/docs/cli/usage.md) |
| **Source** | [github.com/Shailesh200/prism](https://github.com/Shailesh200/prism) |

## License

[MIT](https://github.com/Shailesh200/prism/blob/main/LICENSE)
