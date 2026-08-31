# Changelog

Notable changes to Prism. This file is for people who use Prism; the commit
history is for people who work on it.

Prism follows [semantic versioning](https://semver.org). The version below is
shared by everything that ships together — the VS Code and Cursor extensions,
the `prism` CLI, the `prism-mcp` server, and the Core SDK they all call. They
move as one because they are one build; a mismatch between them has never been
a supported configuration.

## 1.1.14 — Claude Code workers

- **Dispatch:** jobs run on the host's own agent CLI — a Cursor agent in Cursor, a Claude Code agent (`claude -p`) in Claude Code. `configure` → `workerBackend` overrides; `PRISM_WORKER` works too.
- **Dispatch:** Claude workers reuse the machine's existing Claude Code sign-in. `prism init` checks the `claude` CLI and says what to run — never asks for a key.
- **Dispatch:** same contract on both backends: own worktree, no shell, no MCP, console (`job_logs`), stall detection, Prism-side commit + checks, review before land. Resume continues the Claude session.
- Keep `@latest`; hop on the next Cursor/MCP start. Logs: `prism-mcp 1.1.14: workspace …`. `@repo-prism/dispatch@1.1.14`, `@repo-prism/dispatch-hub@1.1.14`, and `@repo-prism/mcp-server@1.1.14`.

## 1.1.13 — Job console, stall detection, review before land

- **Dispatch:** each job keeps an append-only console. Ask “what is it doing” / “show me the logs” (`job_logs`).
- **Dispatch:** a live worker that goes quiet is stalled — chat says **no activity for N minutes** and offers resume or cancel.
- **Dispatch:** finishing is not landing. Prism still commits the job branch and runs checks; a job that changed files returns **ready for your review**. Nothing is merged or pushed for you.
- Keep `@latest`; hop on the next Cursor/MCP start. Logs: `prism-mcp 1.1.13: workspace …`. `@repo-prism/dispatch@1.1.13`, `@repo-prism/dispatch-hub@1.1.13`, and `@repo-prism/mcp-server@1.1.13`.

## 1.1.12 — Agent Dashboard Hub + worker OS CAs

- **Dispatch:** a local jobs board watches every registered repo, lists parallel teammates, and fires a desktop notification (plus a Cursor toast) when one finishes. Open **Prism: Open Agent Dashboard** or `http://127.0.0.1:17330/`. `PRISM_HUB=0` opts out.
- **Dispatch:** job workers trust OS certificate stores so they can reach Cursor behind HTTPS interception. A failed network call is spoken as a network error, not the SDK's "Network request failed".
- Keep `@latest`; hop on the next Cursor/MCP start. Logs: `prism-mcp 1.1.12: workspace …`. `@repo-prism/dispatch@1.1.12`, `@repo-prism/dispatch-hub@1.1.12`, and `@repo-prism/mcp-server@1.1.12`.

## 1.1.11 — Agent Dashboard Hub

- **Dispatch:** a local jobs board watches every registered repo, lists parallel teammates, and fires a desktop notification (plus a Cursor toast) when one finishes. Open **Prism: Open Agent Dashboard** or `http://127.0.0.1:17330/`. `PRISM_HUB=0` opts out.
- Keep `@latest`; hop on the next Cursor/MCP start. Logs: `prism-mcp 1.1.11: workspace …`. `@repo-prism/dispatch@1.1.11`, `@repo-prism/dispatch-hub@1.1.11`, and `@repo-prism/mcp-server@1.1.11`.

## 1.1.10 — Dispatch every code change by default

- **MCP:** a request to change the repo (`fix that issue`, `make this work like that`) starts a teammate without a ticket, PRD, or the words “start working on”. The agent writes the PRD itself. “Do it now” / “right here” keeps the edit inline. Combined with 1.1.9: finished jobs still commit, run typecheck/test, and may use in-process subagents.
- Keep `@latest`; hop on the next Cursor/MCP start. Logs: `prism-mcp 1.1.10: workspace …`. `@repo-prism/dispatch@1.1.10` and `@repo-prism/mcp-server@1.1.10`.

## 1.1.9 — Durable Dispatch jobs (commit, checks, subagents)

- **Dispatch:** when a teammate stops, Prism commits the job branch and runs typecheck/test. Empty work says “produced no reviewable change”; summaries cannot cite files that were never written. Write-ups under `.prism/dispatch/notes/` ship with the commit.
- **Dispatch:** in-process subagents (`task`) are on; host fan-out stays off. Jobs are admitted on free memory (default `maxJobs` 4). Orphan worktrees with no unmerged commits are pruned.
- **MCP:** describing work is enough to start a job — no “start working on” phrase. The agent announces what it will start first. Local checkouts no longer hop to npm. Keep `@latest`; hop on the next Cursor/MCP start. Logs: `prism-mcp 1.1.9: workspace …`. `@repo-prism/dispatch@1.1.9` and `@repo-prism/mcp-server@1.1.9`.

## 1.1.7 — Open-folder jobs without reloading after every publish

- **MCP / Dispatch:** ignore Cursor’s `Library/Containers` sandbox as a workspace. `start_job` / `start_my_day` accept `workspace` (the folder the agent already has open). Recommended mcp.json sets `CURSOR_WORKSPACE` to `${workspaceFolder}` — not a path you type.
- **Updates:** at startup the server checks npm and hops to a newer `@repo-prism/mcp-server` when `npx @latest` is stale. Keep `@latest` in mcp.json. A running session cannot swap mid-chat; the next Cursor/MCP start picks up the publish.

## 1.1.6 — Auto-bind Dispatch to the open chat folder

- **MCP / Dispatch:** starting a job from chat no longer fails with `fatal: not a git repository` when the MCP process was launched from the editor user folder. After initialize, Prism asks the client for MCP roots and rebinds Intelligence + Dispatch to the open folder. Git child processes ignore inherited `GIT_DIR` / `GIT_WORK_TREE`. Startup log: `prism-mcp 1.1.6: workspace … (from mcp roots)`. Pin `@1.1.6` or clear `~/.npm/_npx` after install.

## 1.1.5 — Calendar token refresh

- **Dispatch:** start-my-day renews Google Calendar (and other vendor) access tokens through Prism Auth `/oauth/refresh` so connect lasts past the one-hour Google token. MCP logs print `prism-mcp 1.1.5` on startup. `npx @latest` can still serve a cached tree; pin the new version or clear `~/.npm/_npx` after a publish.

## 1.1.4 — Standup start-my-day

- **Dispatch:** start-my-day is a standup: greeting, yesterday (git + finished jobs + completed Linear), then open items on Linear/GitHub/Slack/Calendar. Linear OAuth uses a Bearer token so assigned issues actually load after connect.

## 1.1.3 — Corporate TLS for connect

- **MCP:** trust the OS certificate store at startup so `connect Linear` (and other Prism Auth grants) work behind corporate HTTPS inspection. Cursor reload no longer depends on `NODE_USE_SYSTEM_CA` in mcp.json. If the probe still fails, the error now includes the TLS/HTTP reason instead of a bare “unreachable.”

## 1.1.2 — Connect on Cursor

- **MCP:** skip the extra Continue elicitation on Cursor. The host advertised form elicitation then auto-returned `cancel`, which aborted Linear/Slack/Calendar connect before Authenticate appeared. Connect goes straight to the native Authenticate control.

## 1.1.1 — Dispatch MCP

- **Dispatch:** chat-native teammate on the same `prism` MCP server — `start_my_day`, jobs on local Cursor SDK workers, remember, configure, loopback OAuth (GitHub user, Linear, Jira, Slack mentions + tracked channels, Notion, Google Calendar). Connect goes through Prism Auth (`auth.prismhq.in`); Cursor shows a native Authenticate control and step list, Claude opens the auth page. Users never paste client ids. Tokens stay in the OS keychain. Local job workers sign in once via `init` / first `start_job` (`Cursor.auth.login`); do not put `CURSOR_API_KEY` in mcp.json. Jobs use a ticket or title slug (`audit-issues`) as the canonical id — chat never speaks `job-<hex>`. Each worker runs in its own process and git worktree (default one at a time; no Prism MCP on the job agent; worktrees symlink the host `node_modules`). Say **where are we** for live status and the result when a teammate finishes or fails. Google’s “hasn’t verified this app” screen for Calendar is expected until Prism Auth finishes sensitive-scope verification — click Advanced, then continue.
- **Package:** `@repo-prism/dispatch` plus `@repo-prism/dispatch-auth` (broker handlers on the website). Intelligence tools stay Core-only; Dispatch does not index.
- **Privacy:** new consent purposes for Dispatch drivers; user tokens in the OS keychain; OAuth app secrets stay on Prism Auth, not in the npm package.
- **MCP:** server handshake advertises title `Prism`, website, and the faceted P mark (`icons`) for clients that render it.

## 1.1.0 — Completion program (M-053–M-063)

- **Proof:** agent-orientation benchmark harness (`bun run bench:orientation`) and published methodology at `/benchmarks`.
- **Distribution:** one-click MCP install (Cursor deeplink + copyable JSON) on website and README; MCP Registry manifest prepared in-repo.
- **Marketing:** side-by-side demo script, URL alignment to `https://www.prismhq.in`, completion-program changelog entry.
- **Surfaces shipped in program:** presentation consolidation, public website, agent surface v2, CI/GitHub Action, SARIF, domain reports, deep TypeScript, backend intelligence, npm publish pipeline, extension marketplace.

## 1.0.5

- **MCP:** first-index progress via MCP logging + stderr (`Indexing… phase (n/total)`).
- **Extension:** VS Code / Cursor Getting Started walkthrough; Cursor manifesto
  parity (context menus + all commands); Safe Delete Check opens Blast in
  **delete** intent.
- **CLI:** bare `prism` exits 0 with help; unknown commands suggest a nearby name.

## 1.0.4

- **MCP:** server instructions teach agents to call Prism from plain-language
  requests (users never need to type tool names). Optional prompts: `orient`,
  `before_edit`, `review_diff`.
- **Docs:** step-by-step install for CLI, MCP (Claude Code / Cursor / Desktop /
  Codex), and the IDE extension; zero-config workspace (git root) throughout.
- **CLI (local):** `doctor` warns (not green-ok) when no index cache yet;
  `--verbose` prints workspace source and index timing.

## 1.0.3

- MCP: fix `initialize` instructions tool name (`blast_radius`, not `prism_blast_radius`).

## 1.0.2

- MCP: resolve workspace via git root (same as CLI); docs drop required `--workspace`.

## 1.0.1

- npm packages under **`@repo-prism/*`** (`cli`, `mcp-server`, `core`, …)
- GitHub + package READMEs: install, integrate (Cursor / Claude / Codex), full CLI command and MCP tool lists

## 1.0.0

First stable release. Prism reads a repository on your machine, builds a model
of it, and answers questions about it. Nothing leaves the machine unless you
say so, for a specific purpose, one purpose at a time.

### What you can do with it

**See the repository.** A map at four zoom levels — repository, package,
feature, file — with layers for risk, coverage, churn and ownership. Landmarks
for the places that matter, bookmarks for the places you keep coming back to.

**Understand a change before making it.** Blast radius for a file or symbol,
with the confidence of each connection shown rather than averaged away. Safe
delete, which tells you what would break. Rename impact across the workspace.
Test impact, so you can run the tests that relate to what you touched.

**Judge the codebase.** An engineering health score built from entropy,
architectural drift, technical debt, churn, conflict risk and knowledge decay —
each with its own provenance, so you can tell a measurement from an estimate.
Trends over time, backfilled from git history where history exists.

**Work through whatever surface fits.** The same analysis reaches you through:

- **VS Code and Cursor** — the full UI in a webview panel.
- **`prism`** — 26 commands, `--json` for scripts, `--fail-on` for CI gates.
- **`prism-mcp`** — 28 read-only tools over stdio, for AI agents.
- **The playground** — the same screens in a browser, for trying it out.

All four call the same `@repo-prism/core`. None of them re-implements analysis, and
a test fails if one tries.

### What it does not do

Honest limits, stated once here and in more detail in the
[documentation](https://github.com/Shailesh200/prism/blob/main/docs/reference/known-limitations.md):

- **TypeScript and JavaScript only.** Other languages are counted but not
  parsed. Their imports do not appear in the graph.
- **Feature grouping is inferred**, from directory structure and import
  clustering. It is a good guess, not a declaration you made.
- **Git-derived signals need git.** Churn, ownership and trends are absent —
  and shown as absent, not as zero — in a repository without history.
- **Windows is untested.** It runs in CI as an advisory job. macOS and Linux
  are supported.

### Privacy

No telemetry. No accounts. No cloud. Core analysis makes no network request,
and a test suite proves it by trapping `fetch` and raw sockets across every
analysis entry point and failing if one fires.

Five things can reach the network, each behind its own consent, recorded in
`.prism/consent.json` and revocable: GitHub API access, PageSpeed, installing
Lighthouse, `git fetch`, and Gravatar avatars. Nothing is on by default. An
agent cannot consent on your behalf — the MCP server does not expose a single
consent-gated capability, and a test enforces that.

See [PRIVACY.md](./PRIVACY.md) and [SECURITY.md](./SECURITY.md).

### Performance

Measured on generated repositories at 1k, 10k and 50k files, with budgets
enforced by a separate CI job. On an Apple Silicon laptop at 10k files: first
index 18.5s, subsequent index 2.7s, reindex after one file changed 1.9s,
repository map 1.0s. Absolute numbers depend on the machine; the shape across
scales does not. Method and full baselines are in
[`plans/architecture/08_PERFORMANCE.md`](./plans/architecture/08_PERFORMANCE.md).

### Requirements

Node 26.5.0 or later (pinned in `.nvmrc`), and Bun 1.3.11 to build from source.
