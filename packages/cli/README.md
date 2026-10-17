# @repo-prism/cli

[![npm](https://img.shields.io/npm/v/@repo-prism/cli.svg)](https://www.npmjs.com/package/@repo-prism/cli)
[![license](https://img.shields.io/npm/l/@repo-prism/cli.svg)](https://github.com/Shailesh200/prism/blob/main/LICENSE)

**`prism`** — local-first repository intelligence from a terminal or CI.

**Website:** [https://www.prismhq.in](https://www.prismhq.in) · **Docs:** [https://www.prismhq.in/docs/start/install](https://www.prismhq.in/docs/start/install)

Same engine as the MCP server. Runs on your
machine. Nothing is uploaded.

> Requires **Node.js 24**.

## Setup — step by step

1. Open a terminal **inside your project**:
   ```bash
   cd /path/to/your/repo
   ```
2. Install Prism for your agents, index the repo and see its map:
   ```bash
   prism start
   ```
   It finds Claude Code, Cursor, Codex and opencode by their config folders,
   lists the config files it would write, and asks before changing anything
   (`--dry-run` only lists; `--yes` skips the question in scripts). Existing
   files are backed up to `~/.prism-backups/<time>/configs/` first.
   With none found it still indexes; run `prism install <client>` later.
3. Ask your agent for a change. Prism's `prepare_change` runs first and a
   receipt prints when the agent stops. From a terminal:
   ```bash
   prism prepare "add rate limiting to the login route"
   prism blast src/index.ts --fail-on high
   ```
4. Something off? `prism doctor` checks the install, the index and the daemon.

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

### Set up

| Command | Purpose |
|---|---|
| `prism start` | Set up Prism for every agent found on this machine (lists the changes and asks first; `--dry-run`, `--yes`), index this repository and print its map with what to try next |
| `prism install <claude\|cursor\|codex\|opencode\|all>` | Connect Prism to an agent: MCP server, hooks, skills, and the prepare/receipt rule (`--project`, `--user`, `--local <checkout>`). Moves 1.x data in `~/.prism` to `~/.prism-backups/<time>/1x/` once (nothing deleted), keeping valid custom lenses |
| `prism uninstall` | Remove everything `prism install` added (`--purge` also deletes `~/.prism` and this repository's `.prism`) |
| `prism upgrade` | Re-link the recorded agents to the current build and restart the daemon |

### Diagnostics

| Command | Purpose |
|---|---|
| `prism doctor` | Check Node, the install and the server it pins, published-package references, workspace, git and index (`--ci` warns on shallow clones; `--surfaces` shows which Prism each editor launches; `--fix` stops the daemon and rewrites editor configs to the recorded local build or the installed server) |
| `prism strength` | How much the hooks do: `full` (default), `lite` (session rules and the stop receipt) or `off`; `--repo` sets it for one repository |
| `prism stats` | p50/p95 per hook and tool, outcome counts and top reasons from `~/.prism/events.jsonl` (`--since 1d`) |
| `prism data prune` | List empty workspace folders, caches of deleted checkouts, and untracked worktrees under `~/.prism` (`--yes` removes them) |
| `prism index` | Build or refresh the repository index |
| `prism graph` | The background daemon that keeps each repository's graph fresh: `status`, `serve`, `stop`, `refresh`, `export [--out <dir>]` (`graph.json`) |
| `prism completions <bash\|zsh\|fish>` | Print shell completion script |

### Understand a repository

| Command | Purpose |
|---|---|
| `prism explain <path>` | What a file or folder is for, ownership |
| `prism explore <target>` | Usages, ownership, similar code |
| `prism packages` | Workspace packages |

### Assess a change

| Command | Purpose |
|---|---|
| `prism prepare <task>` | Pack, reuse, and House Style (never file bodies) |
| `prism blast <target>` | Blast radius |
| `prism review [paths…]` | Change review (`--lens <name>` adds that lens's checks; `--format sarif` for code scanning) |
| `prism safe-delete <target>` | Safe to delete? |
| `prism rename <target> <newName>` | Rename edit sites |
| `prism test-impact <target>` | Related tests |
| `prism lens` | Review lenses shared by every repository: `list`, `add <name>`, `remove <id>`, `override <id> --check … --path … --note …` |
| `prism habit` | Routines any agent can run through the `habits` tool: `list`, `add "<name>" --step "source: action"…`, `show`, `edit`, `remove` |
| `prism receipts` | Change receipts the stop hook wrote; `show <n> --as markdown\|svg` for a PR comment or a card |

### Structure

| Command | Purpose |
|---|---|
| `prism deps` | Graph size / hubs |
| `prism cycles` | Import cycles (`--format sarif` for code scanning) |
| `prism symbol <name>` | Find declaration |
| `prism refs <name>` | Find references |
| `prism route <from> <to>` | Dependency path |

### Understand a repository

| Command | Purpose |
|---|---|
| `prism overview` | What this repository is: languages, frameworks, stack, and landmarks (`--limit`) |
| `prism agents-md` | Generate/verify Living AGENTS.md (writes only `~/.prism`) |
| `prism findings` | Unused exports, duplicates, wrappers; mute/unmute |

### Memory

Notes live in `~/.prism/workspaces/<key>/memory.json`, never in the repository.

| Command | Purpose |
|---|---|
| `prism remember` | Save a note (`--symbol`, `--path` anchor it so a rename moves it) |
| `prism forget` | Forget notes by id or matching text |
| `prism memories` | List the notes for this repository |

## Related

| | |
|---|---|
| **MCP** | [`@repo-prism/mcp-server`](https://www.npmjs.com/package/@repo-prism/mcp-server) — one-command agent setup |
| **IDE** | [Prism](https://marketplace.visualstudio.com/items?itemName=prismhq.repo-prism) |
| **Docs** | [CLI guide](https://www.prismhq.in/docs/usage) |
| **Website** | [prismhq.in](https://www.prismhq.in) |
| **Source** | [github.com/Shailesh200/prism](https://github.com/Shailesh200/prism) |

## License

[MIT](https://github.com/Shailesh200/prism/blob/main/LICENSE)
