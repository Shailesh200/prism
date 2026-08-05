# Changelog

Notable changes to Prism. This file is for people who use Prism; the commit
history is for people who work on it.

Prism follows [semantic versioning](https://semver.org). The version below is
shared by everything that ships together — the VS Code and Cursor extensions,
the `prism` CLI, the `prism-mcp` server, and the Core SDK they all call. They
move as one because they are one build; a mismatch between them has never been
a supported configuration.

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
