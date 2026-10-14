# Program — Focus Reset (Prepare · Envelope · Graph)

| Field | Value |
|---|---|
| Status | **Approved** (owner, 2026-10-10) |
| Date | 2026-10-10 |
| Planning milestone | [M-087 Focus Reset Plan](./M-087_focus-reset-plan.md) (this document, docs only) |
| Implementation milestones | [M-088](./M-088_identity-hero-copy.md) → [M-100](./M-100_relaunch.md) (§12) |
| ADRs (Accepted) | [0060](../adr/0060-prism-keeps-its-name.md) · [0061](../adr/0061-workspace-build-everywhere.md) · [0062](../adr/0062-prism-graph-replaces-repository-map.md) · [0063](../adr/0063-prism-daemon-is-a-process.md) · [0064](../adr/0064-dispatch-removed.md) · [0065](../adr/0065-auto-prepare.md) · [0066](../adr/0066-envelope-product-surface.md) |
| Supersedes on approval | [PROGRAM_prism-2.0.md](./PROGRAM_prism-2.0.md) §0 identity, hero copy and sequence; M-080 → M-086 as planned rows (§12.1) |
| Rule | Approved 2026-10-10. The owner directed M-088 → M-100 to be built on `milestone/M-087-focus-reset-plan` in one pass. No commits and no push until the owner asks. |

This program does six things, in this order:

1. **Prism stays Prism, and its hero line changes now** to say what it does for a developer's speed and their agent's output.
2. **One build everywhere.** Every editor and host on the owner's machine runs the build in this repository, never the published npm package, the published plugin, or the Marketplace extension.
3. **Cleanup.** Machine state, git state, product surface, code, docs, and process.
4. **Make Prepare and Envelope the hero.** Prepare is what the agent gets before it edits. Envelope is the proof of what reached the model and what it cost.
5. **Prism Graph.** A graphify-style knowledge graph that is always fresh in the background, answers the agent's structural questions, and produces an artifact a human can open and share.
6. **First run, proof, and scope cuts.** The receipt stays as the closing line of every change and is fixed and explained (§3).

---

## 0. Owner decisions (2026-10-10)

| # | Decision | Effect in this plan |
|---|---|---|
| D1 | **No rename.** The product is **Prism**, everywhere, permanently. Prismate is cancelled, not deferred. | ADR-0060. M-088 removes Prismate from code, copy and plans. Keep `@repo-prism/*` on npm, `prismhq.repo-prism` on the Marketplace, `prismhq.in`, and GitHub `Shailesh200/prism`. M-081 and the identity half of M-086 are cancelled. |
| D2 | **The hero line changes now** and focuses on developer utility and DevX performance. | §1.1. M-088 is the first implementation milestone, and it is copy only. |
| D3 | **Use Claude Code for anything** that needs a real agent. | §1.2. Claude Code is the reference host for hooks, auto-Prepare and the receipt. It is also the agent for the A/B proof, the kill test, end-to-end smoke tests, and first-run precision triage. |
| D4 | **Drop Live Relay.** | M-090 drops `stash@{0}`. No Live Relay code survives. |
| D5 | **Hero = Prepare + Envelope.** Graph is the background feature. | §1. |
| D6 | Review points #4 (first run), #5 (proof), #6 (cut scope) approved. | §8, §9, §10. |
| D7 | **Node 24 for the build and every host launch.** Exact pin **24.18.1**. Not 24.19+: those releases abort `better-sqlite3` in `Statement` GC ([nodejs/node#65446](https://github.com/nodejs/node/issues/65446)), which crashed Core's tests. Move up once that is fixed, or once `better-sqlite3` 13 (N-API) lands. | ADR-0061. M-089. The 22/24/26 public-surface matrix stays so published packages keep that compatibility check. |
| D8 | **Envelope lives in `@repo-prism/core`.** No new package. | ADR-0064. M-091. |
| D9 | **Eval repos are named.** | §9.1 and §15. |
| D10 | Hero wording, gitignore `opencode.json`, drop unmerged Dispatch branches after the M-090 table (keep none), do not push `main`, daemon pauses below 20% battery. | §1.1, §15. |

---

## 0b. Evidence (measured on the owner's machine, 2026-10-10)

The plan follows from these facts. Each was read from a file or a command, not assumed.

### Integration

| # | Finding | Where |
|---|---|---|
| E1 | Cursor loads **two** Prism MCP servers. `prism` is the local build: 19 tools, 5 Intelligence and 14 Dispatch. `plugin-prism-prism` is the Claude plugin `prism@local` 1.12.0, whose `mcp.json` runs `npx -y --prefer-online @repo-prism/mcp-server@latest`, the **published** server, with about 50 tools and the old, long instructions. The two instruction sets contradict each other ("Prism does not run a background agent" vs "ask: background teammate or here?"). | `~/.cursor/mcp.json`; `~/.claude/plugins/cache/prism-local/prism/1.12.0/mcp.json` |
| E2 | The installed plugin is a **copied snapshot** of 1.12.0, not a link to `packages/plugin/dist/pack`. Every rebuild leaves it stale. | `~/.claude/plugins/installed_plugins.json` |
| E3 | The plugin generator **hard-codes** the published server: `mcpConfig()` emits `npx … @repo-prism/mcp-server@latest`. | `packages/plugin/src/definition.ts` |
| E4 | Claude Code hooks are registered **twice**: once in `~/.claude/settings.json` (local `dist/bin.js`) and once by the plugin. The plugin copy's `mcpBin()` finds no sibling `mcp-server/dist`, so it falls back to `npx -y @repo-prism/mcp-server`, the published server. One stop event can produce two receipts from two builds. | `~/.claude/settings.json`; plugin `hooks/hooks.json`; `prism-hook.mjs` |
| E5 | Marketplace extension `prismhq.repo-prism` **1.0.0** is installed in Cursor. It is published and old. | `~/.cursor/extensions/prismhq.repo-prism-1.0.0` |
| E6 | Hooks say "Prism is still indexing" although `hooks/snapshot.json` exists for this workspace. This happened at session start today and again on every edit in this planning session. `~/.prism/hook-log` has no line for today, so the message comes from a copy or path that does not log. | `~/.prism/hook-log`; `~/.prism/workspaces/6e57…/hooks/snapshot.json` |
| E7 | Node mismatch. `~/.cursor/mcp.json` launches with Node 23.1.0. M-078 is stuck **In Review** because `better-sqlite3` is built for Node 23 but the runner wants Node 26. | `plans/PROGRESS.md` M-078 |

### Usage (`~/.prism/envelope-ledger.jsonl`)

- **119** Prism tool calls from 2026-09-17 to 2026-10-06, all from Cursor, all on this repository.
- By tool: `prepare_change` 39, `blast_radius` 22, `explain_area` 11, `find_symbol` 8, `search_symbols` 7, `review_changes` 7. Everything else is 6 or fewer.
- Average response: `prepare_change` **30.8 KB (~7.7k tokens)** against a declared 4,000-token default budget. `list_features` 73 KB, `repository_dna` 34 KB, `test_impact` 14 KB, `blast_radius` 13.8 KB.
- The stop receipt ran **twice** in that window. One row was kept in `receipts/history.jsonl`.

### Receipt quality

- The stored receipt printed `60 scoped test files ✓` once per package for four packages. **Bug:** `renderReceipt` prints the global `receipt.testFiles.length` for every package's test check.
- The verdict (`proven` / `unproven` / `failed`) is never printed.
- "Touched 50 files+ · 683 dependents" on a large dirty tree: not scoped to the session.
- **Baseline blindness.** In replay benchmark R0 (`plans/notes/benchmark/R0.md`), every case's receipt verdict is `failed`, **including the clean controls**, because checks already failing before the change still count. On a repo with any red test, the stop hook would `block` the agent and send it to fix failures it did not cause.

### Code mass (TS/TSX lines, excluding `dist` and `node_modules`)

| Area | Lines |
|---|---|
| `app-shell` | 51,135 |
| `intelligence` | 28,619 |
| `dispatch` | 27,386 |
| `dispatch-hub` | 19,548 |
| `ui` | 11,152 |
| `core` | 11,097 |
| `impact` + `indexer` + `analyzer` + `graph-engine` + `navigation` | 7,935 |

`@repo-prism/mcp-server` imports `@repo-prism/dispatch` for the Envelope ledger and `writeLastPrepareChange`. **The hero features currently live inside the package we are cutting.**

### Proof

- `scripts/bench/agent-orientation.ts` (M-063) *simulates* a naive agent and counts bytes.
- `scripts/replay-benchmark.ts` (M-079) replays real regressions on es-toolkit, zod and hono. In R0 it caught 5 of 7 runnable regressions, with 1 false alarm in 6 controls and a 3.4s median receipt.
- No real agent has been run with and without Prism.

### Hygiene and naming

- More than 30 `dispatch/*` branches. 5 Dispatch worktrees, 2 of them `prunable`. 7 stashes. `main` 7 commits ahead of `origin/main`. 137 MB under `~/.prism` for this workspace.
- 88 milestone docs, 60 ADRs.
- "Prismate" already appears in 9 UI source files (`packages/app-shell/src` ×8, `packages/dispatch-hub/src/dashboard` ×1) and across plans. The hero copy "A teammate meant for you" is locked in Q-027 and PROGRAM_prism-2.0 §0.1. "Local-first Software Intelligence Engine" is in `README.md`, `package.json`, `apps/website/lib/seo.ts`, `packages/mcp-server/src/branding.ts`, `AGENTS.md`, `CLAUDE.md`, the PRD and the HLD.

---

## 1. Product thesis

**Prism makes your coding agent faster and right the first time: it hands the agent what it needs before it edits, and proves the change when it stops. Locally.**

One loop, three moments, one brain:

| Moment | Feature | What the developer gets | Who runs it |
|---|---|---|---|
| Before the edit | **Prepare** | The files to open, the helpers that already exist, the house style, the off-limits paths. One bounded answer, so the agent stops grepping and stops re-inventing. | A hook, automatically, from the prompt. The model can also call it. |
| While working | **Envelope** | How much Prism put into context, what that cost, and an honest estimate of what it saved. | Measured on every call and every hook injection. |
| After the edit | **Receipt** | What changed, what was proven by a check that ran, what was not. The agent cannot claim "done" over a failure **it** caused. | The stop hook, automatically. |
| Underneath | **Prism Graph** (Iris) | An always-fresh graph of code, tests, docs, ADRs, git history and memories, plus `graph.html` you can open and share. | A background process. Never a model. |

- **Hero = Prepare + Envelope** (D5). `prepare_change` is already the most-called tool. Envelope turns "it helped" into a number.
- **Graph is the feature developers will screenshot.** It returns with three jobs: answering the agent, a blast overlay, and an artifact you can share (ADR-0062).
- **Not in the product:** jobs, teammates, standups, background workers, a skills editor (§10).

### 1.1 Hero copy (D2: change now, DevX performance)

**Recommended lock.** The owner confirms the wording at M-088 review. It replaces Q-027 and PROGRAM_prism-2.0 §0.1.

> **Faster agent sessions. Fewer broken builds.**

Sub-line:

> Prism maps your repo on your machine and gives your coding agent the right files, the code that already exists, and what will break — before it edits. When it stops, Prism runs the checks that change reaches and tells you what's proven.

Kicker:

> Local-first · No account · Cursor · Claude Code · CLI

Category line (replaces "Local-first Software Intelligence Engine" in package descriptions, SEO, MCP branding, AGENTS/CLAUDE):

> Local context and change checks for coding agents.

Alternates, if the owner prefers:

- "Less context. Fewer retries. Proven changes."
- "Your coding agent, without the wasted context."
- "Know what breaks before your agent does."

**Claim rule.** No numbers in public copy until M-098 publishes real-agent results. After M-098, the sub-line may add measured numbers ("…X% fewer tokens, Y fewer broken builds in our benchmark"), only where the confidence interval excludes zero. If M-098 does not support "faster" or "fewer broken builds", the hero is revisited before M-100, not defended.

Banned in copy: teammate, assistant, AI-powered, magic, intelligent, he/him, Prismate.

### 1.2 Claude Code as the reference agent (D3)

| Use | How |
|---|---|
| Reference host | Hooks, auto-Prepare (prompt-submit hook) and the receipt are built and accepted on Claude Code first. Cursor parity is a DoD line in the same milestone wherever Cursor's hook API allows it. Where it does not, the gap is written down, not hidden. |
| Real-agent A/B (M-098) | Claude Code headless (`claude -p`, JSON output) with the owner's account, with and without the dev pack |
| Kill test and end-to-end smokes | Every milestone that changes a hook ends with one real Claude Code session on a fixture repo, and its transcript is saved under `plans/notes/smoke/` |
| First-run precision triage (M-097) | Claude Code reads each finding and its files and proposes true or false. **The owner signs off.** The gate counts only human-confirmed labels. |
| Prepare replay eval (M-093) | Deterministic, no agent. Claude Code is used only for an optional "did the agent use the pack" spot check. |
| Cost control | Every harness that spends tokens prints an estimate and asks before running. Run budgets live in the milestone doc. |

This is development tooling. Prism's Core analysis still makes **no network calls and calls no model** (ADR-0058, privacy default).

---

## 2. Phase 0 — One build everywhere (M-089)

**Goal:** On the owner's machine, every surface runs the code built from this checkout: Cursor MCP, Cursor hooks, Claude Code MCP, Claude Code hooks, skills, commands, IDE extension, opencode, CLI. Nothing resolves to npm `@latest`, the published plugin, or the Marketplace extension. A check proves it and fails loudly on drift.

### 2.1 Inventory — everything that points at a published artifact

| # | Surface | Today | Target |
|---|---|---|---|
| P1 | Claude plugin MCP (also loaded by Cursor as `plugin-prism-prism`) | `npx … @repo-prism/mcp-server@latest` | Dev pack `mcp.json`: pinned Node + absolute `packages/mcp-server/dist/bin.js`, `PRISM_SKIP_SELF_UPDATE=1`, workspace taken from the client |
| P2 | Installed plugin copy | Frozen 1.12.0 snapshot in `~/.claude/plugins/cache/prism-local/…` | Reinstalled from `packages/plugin/dist/pack` on every `dev:link`, from a local marketplace rooted in this repo |
| P3 | Plugin hooks | Cached `prism-hook.mjs` falls back to `npx @repo-prism/mcp-server` | `PRISM_MCP_BIN` baked into the dev pack. The `npx` fallback exists only in public packs |
| P4 | Duplicate hooks in `~/.claude/settings.json` | Four entries pointing at the repo hook | **Removed.** Hooks come from the pack only |
| P5 | `~/.cursor/mcp.json` `prism` | Local build, Node 23.1.0, `PRISM_WORKSPACE` hard-coded | **Removed.** Cursor gets MCP, skills and hooks from the dev pack. If this Cursor version does not run Claude-plugin hooks, `dev:link` writes `~/.cursor/hooks.json` from the same definition (decided and recorded in ADR-0061) |
| P6 | Marketplace extension `prismhq.repo-prism` 1.0.0 | Published | Uninstalled; the local VSIX from `packages/cursor-extension` is installed |
| P7 | MCP self-update (`auto-update.ts`) | The published server updates itself | Off in the dev pack. Checked by the doctor |
| P8 | `opencode.json` (repo, untracked) and `~/.config/opencode/opencode.jsonc` | Both local | Keep the global one. The repo one is gitignored |
| P9 | `.github/workflows/prism-review.yml` | Already `prism-command: node packages/cli/dist/cli.js` | No change |
| P10 | README / docs `@latest` snippets | Public instructions | No change. Add "Developing Prism: use `bun run dev:link`" |

### 2.2 `bun run dev:link` / `dev:unlink`

1. **Pin Node 24.18.1** in `.nvmrc`, `engines` and `dev:link` (D7). Build and launch use the same binary, so `better-sqlite3` matches (fixes E7 and unblocks M-078).
2. Build with moon: `shared → core → … → mcp-server → plugin → cursor-extension`.
3. Emit the pack in **dev mode** (`definition.ts`): absolute local paths in `mcp.json` and in the hook environment. The public pack is unchanged.
4. Install the pack into Claude Code from the local marketplace, replacing `prism@local` 1.12.0, and enable it.
5. Remove P4 and P5, backing up each edited file to `~/.prism/backup/<timestamp>/`.
6. Uninstall P6 and install the local VSIX.
7. Run `prism doctor --surfaces` and print one line per surface.

`dev:unlink` restores the backups. Both are owner-only and never run in CI.

### 2.3 `prism doctor --surfaces`

For each host config it finds (Cursor, Claude Code, Claude Desktop, opencode, Codex), it reports the registered Prism server, hooks and skills, and resolves each to `workspace build (this checkout)`, `published npm`, `published plugin`, `marketplace extension`, or `other`.

- It **fails** inside the Prism repo when anything resolves to a published artifact, or when one host has two Prism servers.
- It is advisory in `verify:milestone` (it reads `$HOME`, so it cannot gate CI). The session hook runs it too, and on drift the session's first message says so.

### 2.4 Fix E6 (the false "still indexing")

- Every hook run logs its copy path, its `cwd` source (`input.cwd`, `process.cwd()`, or Cursor's `workspace_roots`), and the resolved workspace key.
- The workspace is resolved from the host's own field when `cwd` is absent, then from the git root of `process.cwd()`.
- **Acceptance:** new Cursor and Claude Code sessions on this repo print the orientation line, not "warming", while a snapshot exists.

---

## 3. The receipt — what it is, in detail

### 3.1 In one sentence

When the agent stops, Prism (not the model) works out what this change touched and what depends on it, runs the checks that actually reach it, and prints a five-second verdict: **proven, unproven, or failed.** If a check the change broke failed, the agent is sent back to fix it before it can say "done".

### 3.2 Why it exists

Agents say "done, all tests pass" without running anything, or after running the wrong tests. The receipt replaces the model's claim with evidence. Every line traces to a Prism read (the graph) or to a command that ran (ADR-0058 §2: Prism does not run agents, it checks their work).

### 3.3 When it runs

- **Claude Code:** the `Stop` hook calls `prism-hook.mjs stop`, which spawns `prism-mcp --hook stop` in the workspace (`packages/mcp-server/src/safety/hook-command.ts`).
- **Cursor:** the same hook, through the dev pack (§2).
- Not during a continuation the hook itself caused (`stop_hook_active`), so it never loops.
- The replay benchmark calls the same `buildChangeReceipt`, so the benchmark measures the shipped product.

### 3.4 How it is computed (`packages/mcp-server/src/safety/receipt.ts`)

1. **Re-index** the working tree so uncommitted edits are seen.
2. **Guard the session.** `guardSession` ranks dirty files by blast risk and flags `duplicate` (reimplements something that exists), `orphan` (nothing imports it), `boundary` (touches a package the session is not mostly in), or high risk. Up to **25** files are analysed; the rest are counted.
3. **Per source file:** compute its **blast radius** (reverse dependents, which make the "dependents" count) and its **test impact** (test files that reach it). A file no test reaches is recorded as **not proven — no test reaches it**.
4. **Per package** (up to **6**): run that package's own typecheck, lint and test scripts. Tests run **scoped** (only the up to 60 selected test files) when the runner allows, otherwise the full script. Missing or interrupted checks are recorded as such, never as passes.
5. **Verdict:**
   - `failed`: a check that ran failed.
   - `unproven`: nothing failed, but a changed source file has no reaching test, or its tests did not run.
   - `proven`: every changed source file is reached by a test that ran and passed.
   - `clean`: nothing changed.
6. **Emit.** Render the text block (`renderReceipt`), append it to `~/.prism/workspaces/<key>/receipts/history.jsonl`, and return hook JSON:
   - On `failed`, `decision: "block"` with the failing checks and scoped tests. The agent must fix them before it can finish. **This is the one place Prism changes agent behaviour without the model choosing to call it.**
   - Otherwise, `additionalContext` with the receipt text.

### 3.5 What each line means

| Line | Meaning |
|---|---|
| `Touched N files · M dependents` | Files this change edited, and how many other files depend on them (from the graph, not grep). `+` means capped. |
| `Proven …` | Checks that ran and passed, per package: `typecheck ✓`, `lint ✓`, `K scoped test files ✓`. |
| `Failed …` | A check that ran and failed, with its first useful line. |
| `Not proven <path> — no test reaches it` | Changed, and no test reaches it directly or through dependents. |
| `Not proven <path> — its tests did not run` | Tests exist but did not run (capped, interrupted, or no runner). |
| `Flag duplicate / orphan / boundary / high-blast` | Worth a human look. High-blast is risk ≥ 60. |
| `Lenses …` | Optional `review_with` verdicts recorded in the session (ADR-0059). |

### 3.6 What is wrong with it today (fixed in M-092)

1. **Baseline blindness (most important).** Checks already failing when the session started count as `failed` and `block` the agent. Fix: the session-start hook records a baseline (dirty set plus the last known check status per package), and at stop each failure is classified as **caused by this change** or **already failing**. Only caused failures produce `failed` and `block`. Already-failing ones are reported on their own line. Acceptance: R0 controls stop showing `failed`.
2. **Not scoped to the session.** Pre-existing dirty files flood it. Fix: subtract the session-start dirty set (`preExistingChanges` already exists in the API, but the hook never passes it).
3. **Per-package test count bug** (`60 scoped test files ✓` × 4).
4. **No verdict line.** The first line becomes the verdict: `Prism · proven`, `Prism · unproven (2 files)`, or `Prism · failed (1 check)`.
5. **Invisible.** It fired twice in three weeks. Fixed by Phase 0, plus an Envelope footer (§6), `prism receipts`, and a markdown renderer for PR comments and an image card for sharing.

---

## 4. Phase 1 — Cleanup (M-090, M-091; code deletion in M-099)

Ordered by blast radius: what cannot break the build goes first; what deletes code goes last, after replacements exist.

### 4.1 Machine (no repo change; `dev:link` plus a checklist in M-090)

- Remove the stale plugin cache `~/.claude/plugins/cache/prism-local/prism/1.12.0` once the dev pack is installed.
- Prune the Dispatch worktrees under `~/.prism/workspaces/6e57…/dispatch/worktrees` after the owner reviews the list.
- Add `prism data prune` (dry run by default, `--yes` to act). It keeps the Envelope ledger, receipts, prepare history, the hook snapshot and the current index. It drops caches for workspaces no longer on disk.
- `~/.prism/hub` and Dispatch state are removed in M-099.

### 4.2 Git

- **Branches:** a table of every `dispatch/*`, `cursor/*` and `chore/*` branch with its last commit date and merged status. Merged ones are deleted. Unmerged ones are deleted only after the owner reviews the table. Nothing is force-deleted unlisted.
- **Stashes:** `stash@{0}` (Live Relay) is **dropped** (D4). The others (lefthook backups ×2, `npx prefer-online lock`, `1.1.8 version bumps`, oxfmt leftovers, `console sanity + pack gaps`) are each shown as a diff summary. Each is then applied on its own milestone or dropped, with owner sign-off per item.
- **`main` ahead by 7:** nothing is pushed unless the owner asks.

### 4.3 Product surface (M-091)

**Default MCP tool list: six tools.**

| Tool | Why |
|---|---|
| `prepare_change` | The hero |
| `blast_radius` | The answer to "what breaks" |
| `graph` | One structural tool (§7.4). Until M-096 lands, `find_symbol` and `explain_area` stand in |
| `guard_session` | Before landing, and it feeds the receipt |
| `test_impact` | Which tests to run |
| `repository_overview` | Orientation |

- **Behind `PRISM_MCP_FULL=1`:** health, testing, security, backend and engineering-health reports, DNA, landmarks, features, packages, stack profile, cycles, `safe_delete`, `rename_impact`, `breaking_change_hints`, `changed_paths`, `review_changes`, `agents_md`, `list_findings`, `review_with`, `lens`.
- **Removed from MCP:** all 14 Dispatch tools (`start_my_day`, `init`, `sleep`, `wake`, `start_job`, `queue_finding`, `job_logs`, `list_jobs`, `job_control`, `use_skill`, `configure`, `dispatch_doctor`, `working_set`, `remember`). `remember` returns as `prism remember` (CLI) plus Graph memory nodes (§10).
- **Instructions:** about 12 lines. What Prism is; call `prepare_change` before an edit if the hook has not already injected it; `blast_radius` before deleting or renaming; read the receipt when you stop; inferred edges need the file opened. A contract test caps the byte size at 1.5 KB.
- **Skills:** keep `prism-safe-change`, `prism-review-pr`, `prism-onboard`, `prism-ship`. Fold `prism-verify-regression` into the receipt.
- **Commands:** `/prism-check`, `/prism-review`, `/prism-graph`.

### 4.4 Code (M-091 moves, M-099 deletes)

1. **Move (M-091):** `envelope-ledger.ts` and `prepare-last.ts`, with their tests, move from `@repo-prism/dispatch` into `@repo-prism/core` (D8). Dispatch re-exports them for one milestone. `mcp-server` stops importing Dispatch. The `remember` store moves to Iris storage under `~/.prism`, inside Core, because Prepare notes and Lenses read it.
2. **Delete (M-099):** `packages/dispatch`, `packages/dispatch-hub` (after its loopback server and watcher are lifted into the Graph daemon in M-095), the Jobs, Live Relay, Skills-editor and standup screens in `app-shell` and `vscode-extension` (`host-dispatch*`), Dispatch CLI commands, and Dispatch docs.
3. **Dead UI audit (M-099):** `safe_delete` plus the unused-export finder over `app-shell` removes screens ADR-0057 already retired (Domains, Repository Map, Pulse / Board / List) and anything only Dispatch reached.
4. **Target:** 23 → about 18 packages. At least 50k fewer lines. Green after every step.

### 4.5 Docs and plans (M-090 plans; M-100 public docs)

- Move Verified milestone docs (M-000 → M-079) to `plans/archive/milestones/`. `PROGRESS.md` keeps a one-line row with a link. Add `plans/adr/INDEX.md`: one line per ADR with its status, superseded ones marked.
- Public docs (42 pages) shrink to seven: What Prism is, Install, Prepare, Envelope, Graph, Receipt, CLI reference. The rest are archived.
- README: one screen. Hero (§1.1), a 60-second first run (§8), install, three images (receipt, graph, Envelope card).
- `AGENTS.md` / `CLAUDE.md`: drop Dispatch rules, use the new category line, and add "use `dev:link`; never the published build".

### 4.6 Process

- Hard rules unchanged: no commits without approval, one branch per milestone, `verify:milestone`.
- **One-page milestone template:** Goal, In scope, Out of scope, DoD, Verification, Risks. Every milestone in this program uses it.
- ADRs only for boundary changes (process, package, privacy, surface). Not for copy or layout.

---

## 5. Phase 2a — Prepare v2 (M-093)

**Goal:** every change starts with a small, correct pack, without the agent having to remember to ask.

### 5.1 Bounded by contract

- **One budget for the whole response.** Default **2,000 tokens** (bytes ÷ 4, the same rule as Envelope). Hard ceiling 6,000. Today's average is 7.7k.
- Trim order: house-style exemplars, then notes, then work order, then reuse, then pack. A `truncated` block says what was cut and how to get it (`budget`, or a `graph` call).
- A contract test fails if any fixture response is over budget.

### 5.2 Runs without the model choosing (ADR-0065)

- A **prompt-submit hook** (Claude Code `UserPromptSubmit` first; Cursor `beforeSubmitPrompt` where available). When the prompt looks like a change request, the hook gets a compact Prepare (about 800 tokens) and injects it as additional context. It never blocks the prompt.
- **Latency:** ≤ 300 ms p95 from a warm graph (the daemon from M-095). Before M-095 it runs in-process from the hook snapshot plus a bounded Core call, skipping when over budget. Skips are logged.
- **Detection:** a deterministic local rule. Change verbs (fix, add, rename, refactor, implement, remove, migrate, port, make … work) plus at least one path or symbol the graph knows. No model is called. Off switch: `PRISM_AUTOPREPARE=0`.
- The `before-edit` hook also adds one line when the file being edited was **not** in the last pack: "not in Prism's pack; check `blast_radius`".

### 5.3 Replay eval (deterministic, no agent)

- **Dataset:** about 200 non-merge commits touching 2–15 source files, from this repo plus es-toolkit, zod and hono (already used by R0), plus one or two more TS monorepos picked by the same criteria. Task = commit subject + body. Truth = files changed.
- **Metrics:** recall@pack, precision@pack, tokens, reuse hit rate (when the commit used an existing helper, did Prepare name it?).
- **Gate:** no change may lower recall@pack by more than one point on the frozen set. Results go in `plans/notes/prepare-eval/` and on the Iris screen.
- Runs locally from `scripts/bench/`, replaying each commit's parent.

### 5.4 Ranking work (each item gated by the eval)

- Git co-change as a signal.
- Always include the nearest test (test → source edges).
- ADR / doc `rationale_for` edges feed notes.
- Ambiguous symbols come back as candidates, never guessed silently.

---

## 6. Phase 2b — Envelope v2 (M-094)

**Goal:** every session ends with one honest number: what Prism put into context, what it cost, and what it probably saved.

1. **Session grouping.** The session-start hook writes a session id. Tool calls, hook injections and the receipt carry it.
2. **Hook injections count** (`source: hook`). Auto-Prepare and receipt text are context the model received.
3. **Per-tool budgets in one table, with alarms.** Today `list_features` (73 KB) and `repository_dna` (34 KB) would alarm.
4. **"Estimated saved", honestly.** Per answer type, a baseline measured in M-098 (the tokens Claude Code spent reaching the same answer without Prism). Until M-098 it shows `—` with "not calibrated yet". Always labelled an estimate, with a link to the method.
5. **Receipt footer:** `Envelope  7 calls · 9.1k tokens in · est. 38k saved · 0 over budget`.
6. **Surfaces:** `prism envelope` (today, the last 7 days, by tool, the top over-budget calls), the Iris screen (Prepare history, Envelope trend, receipts), and `prism envelope --json` export.
7. **Privacy:** never stores response bodies, prompts or file contents. Only sizes, counts, tool names and paths from Prism's own answers. A schema test enforces this and `PRIVACY.md` states it.

---

## 7. Phase 3 — Prism Graph: always on, graphify-style (M-095, M-096)

**Goal:** one local knowledge graph per repo, always fresh, answering every structural question, and producing an artifact a developer wants to open and share. No model, no network.

### 7.1 Background process (M-095, ADR-0063)

- **One daemon per machine**, started on demand by the session hook or `prism graph serve`, and stopped after a long idle period. It serves every open workspace. It is built from `dispatch-hub`'s loopback server and watcher, not from scratch.
- **Not an agent.** It indexes, watches and answers. It never edits, never runs a model, never runs a job.
- **Fresh:** file-system events trigger M-035's incremental reindex (target: under 1s for a single-file change at 10k files). Optional git hooks (`post-checkout`, `post-merge`, `post-commit`) handle branch switches. The hook snapshot is rewritten on every reindex.
- **Attach, don't index:** MCP and CLI ask the daemon first and fall back to in-process Core when it is not running. This removes the cold `PRISM_INDEX_REQUIRED` path and the duplicate index per MCP process.
- **Limits:** configurable memory cap and nice level. Indexing pauses on battery below 20%. `prism graph status` shows freshness per workspace.

### 7.2 What is in the graph

| Nodes | Edges | Source (local) |
|---|---|---|
| package, file, symbol, test, route | imports, exports, references / calls, tests, owns | Analyzer, indexer, semantic KG (exist) |
| doc page, ADR, milestone, README section | mentions, rationale_for | Markdown parse + symbol / path match (`rationale_for` exists) |
| commit, author | co-changes-with, last-touched-by, hotspot (churn × blast) | Local git log (exists) |
| memory | about (memory → symbol / path) | Iris notes (moved from Dispatch) |
| config, workflow, script | configures, runs | Stack detector (exists) |

Every edge keeps its **provenance**: `measured`, `heuristic`, or `inferred`. The artifact draws inferred edges dashed, and agents are told to open the file before relying on one. M-059's remaining reference-precision work runs inside M-096, because the graph is only as good as its edges.

### 7.3 Artifact (M-096)

Written to `~/.prism/workspaces/<key>/graph/`, or into the repo with `--out .prism/graph` for teams that want to commit it:

- **`graph.html`**: one self-contained, offline file. Package level, then files, then symbols. Layers: communities, hotspots, cycles, test reach, and a **blast overlay** (pick a file, see its rings). Search box. **"Copy as prompt"** on any node. Built from `@repo-prism/ui`'s existing graph code, with no second renderer.
- **`GRAPH_REPORT.md`**: the five most connected modules, cycles, orphans, the riskiest untested hotspots, surprising cross-package edges, ADRs pointing at code that no longer exists, and five questions this graph can answer, as prompts.
- **`graph.json`**: a versioned, documented export.
- **`prism graph open`** rebuilds if stale and opens it.

### 7.4 `graph` tool (replaces seven)

It replaces `find_symbol`, `search_symbols`, `find_references`, `dependency_route`, `explain_area`, `knowledge_graph` and `dependency_graph`.

| Mode | Answers |
|---|---|
| `find` | A symbol or path by name. Candidates when ambiguous |
| `neighbors` | In and out edges, filtered by kind, bounded |
| `path` | How A reaches B |
| `explain` | What a file or folder is for, its owners, its tests |
| `query` | Small declarative filters ("tests reaching X", "files in P importing Q", "ADRs about X"). No free-form code |

Bounded JSON, the Envelope `truncated` contract, and a token budget on every mode.

---

## 8. Phase 4 — First run in 60 seconds (M-097)

**Goal:** `npx @repo-prism/cli` with no arguments, in any TS/JS repo, shows something true and surprising within 60 seconds and gives the developer something to share.

1. Index, with one-line progress.
2. A **report card**: stack, size, health with its three biggest factors, and **three findings** from the strongest true signals (a dependency cycle, a duplicated implementation, an unused export, the riskiest untested hotspot). Each has a path and "why this matters".
3. Open `graph.html` (`--no-open` to skip).
4. One next step: the one-line MCP / plugin install for the detected editor.
5. `--badge`: a local SVG health badge and a report-card image in `.prism/`. Nothing is uploaded.

**Precision gate (most important):** run on 20 popular open-source TS/JS repos. Claude Code triages every finding as true or false, and the owner confirms each label (D3). Only finding types with **≥ 95% confirmed precision** ship on the card. Results are recorded in `plans/notes/first-run-precision.md` and rerun every release.

**Time:** ≤ 60s from `npx` to the card at 10k files on the M-035 reference machine (warm `npx` cache, stated).

---

## 9. Phase 5 — Proof with Claude Code (M-098)

**Goal:** replace the simulated benchmark with a real A/B, publish whatever it shows, and calibrate Envelope.

- **Tasks:** 30–40 past commits with a test that fails before and passes after, from es-toolkit, zod, hono, one or two more TS repos, and this repo's fixtures. Task text = the issue or commit description, with the answer removed.
- **Arms:** (A) Claude Code alone. (B) Claude Code plus the Prism dev pack (auto-Prepare, hooks, receipt). Same model, prompt, machine, and time limit.
- **Runs:** at least 3 per task per arm, in randomised order, headless with JSON output. Before running, the cost is estimated and the owner approves.
- **Metrics:** task success (hidden test plus full suite), broken builds at "done", input and output tokens, wall time, files opened, tool calls, Prism's share of context (Envelope).
- **Reporting:** means with confidence intervals and the raw per-run table, in `plans/notes/benchmark-real-agents.md` and on `/benchmarks` (replacing the simulated numbers). Negative or flat results are published too. A headline is claimed only when its interval excludes zero.
- **Calibration:** the measured baselines become Envelope's "estimated saved" table.

---

## 10. Phase 6 — Cut scope (M-091 surface, M-099 code)

| Feature | Decision | Destination |
|---|---|---|
| Dispatch jobs (start, worktrees, verify / land, Jobs tab) | **Delete** | None. The agent window does this; the receipt covers verification |
| Live Relay | **Dropped** (D4) | None |
| `start_my_day` / standup / connector composition | **Delete** | None. That belongs to the agent's own connectors |
| `sleep` / `wake` / Console / Spectrum | **Delete as product** | Its server and watcher become the Graph daemon |
| `init` / `configure` / `dispatch_doctor` | **Delete** | `prism doctor --surfaces` |
| Skills editor / `use_skill` | **Delete** | Skills ship in the plugin pack |
| `remember` / memories | **Keep, move** | `prism remember`, Graph memory nodes, Prepare notes, Lenses memory |
| `working_set` | **Delete** | Prepare pack + session id |
| `queue_finding` | **Delete** | `list_findings` stays behind `PRISM_MCP_FULL` |
| `review_with` / lenses | **Keep, hidden** | `PRISM_MCP_FULL`; the receipt still shows recorded lenses |
| Health / testing / security / backend reports | **CLI yes, MCP hidden** | The report card uses them |
| Domains, Repository Map UI | **Already removed** (ADR-0057) | The map returns only as Graph |
| IDE extension | **Keep, slim** | One webview: Graph, Iris (Prepare + Envelope), Receipts, Health. No Jobs |
| Prismate rename | **Cancelled** (D1) | Prism everywhere |

---

## 11. Success metrics

| Area | Target |
|---|---|
| Registration | 1 Prism server per host on the owner's machine; `doctor --surfaces` green |
| MCP surface | 6 default tools; instructions ≤ 1.5 KB |
| Prepare | p50 ≤ 2k tokens, p95 ≤ 6k; recall@pack reported and never regressing |
| Envelope | Every session with edits has an Envelope line; no tool p95 over budget |
| Receipt | Fires on ≥ 90% of edit sessions (from `hook-log`); exactly one per stop; R0 controls never `failed` from pre-existing failures |
| Graph | Fresh within 1s p95 after a single edit at 10k files; first warm answer < 1s |
| First run | ≤ 60s at 10k files; shipped finding types ≥ 95% confirmed precision |
| Proof | Real Claude Code A/B published, whatever it shows |
| Code | ≥ 50k fewer lines; Dispatch and dispatch-hub gone; Envelope inside Core; `verify:milestone` green on Node 24.18.1 |

---

## 12. Milestones and order

Each milestone has a one-page doc, its own branch from latest `main`, owner approval before commit, and owner approval before merge.

| # | Milestone | Size | Depends on | Summary |
|---|---|---|---|---|
| M-087 | [Focus Reset Plan](./M-087_focus-reset-plan.md) | S | — | This program, milestone docs, ADR drafts 0060–0066, PROGRESS / Master Plan / Open Questions updates. Docs only. |
| M-088 | [Prism identity + hero copy](./M-088_identity-hero-copy.md) | S | M-087 | D1 + D2 now: remove Prismate, ship the new hero and category line in README, website, SEO, MCP branding, package descriptions, AGENTS / CLAUDE. Copy only. |
| M-089 | [One build everywhere](./M-089_one-build-everywhere.md) | S | M-088 | §2: Node 24.18.1 pin, dev pack, `dev:link` / `dev:unlink`, `doctor --surfaces`, hook E6 fix. Closes M-078. |
| M-090 | [Hygiene](./M-090_hygiene.md) | S | M-089 | §4.1, §4.2, §4.5 plans: branches, stashes (Live Relay dropped), worktrees, `prism data prune`, plans archive, ADR index. |
| M-091 | [Surface cut](./M-091_surface-cut.md) | M | M-090 | §4.3 + §10 surface: 6 default tools, short instructions, skills trimmed, Dispatch off MCP, Envelope / prepare-last / remember moved out of Dispatch. |
| M-092 | [Receipt v2](./M-092_receipt-v2.md) | S/M | M-091 | §3.6: baseline-aware verdict, session scope, verdict line, count fix, markdown / image renderers, `prism receipts`. |
| M-093 | [Prepare v2](./M-093_prepare-v2.md) | M/L | M-092 | §5: response budget, replay eval, auto-Prepare hook, ranking gated by the eval. |
| M-094 | [Envelope v2](./M-094_envelope-v2.md) | M | M-093 | §6: sessions, hook entries, budgets, receipt footer, `prism envelope`, Iris screen. |
| M-095 | [Graph daemon](./M-095_graph-daemon.md) | L | M-094 | §7.1: daemon from the `dispatch-hub` server and watcher, attach-first MCP / CLI, git hooks, snapshot freshness. |
| M-096 | [Graph model, artifact, `graph` tool](./M-096_graph-artifact-tool.md) | L | M-095 | §7.2–7.4, plus the remaining M-059 precision work. |
| M-097 | [First run in 60s](./M-097_first-run.md) | M | M-096 | §8, including the precision gate. |
| M-098 | [Proof with Claude Code](./M-098_real-agent-proof.md) | M | M-097 | §9; calibrates Envelope. |
| M-099 | [Delete Dispatch + dead UI](./M-099_delete-dispatch.md) | M | M-098 | §4.4 deletes + §10 code. |
| M-100 | [Relaunch](./M-100_relaunch.md) | M | M-099 | README, seven-page docs, `/benchmarks`, demo fixture, Marketplace listing, hero numbers if M-098 supports them. |

M-078 stays **In Review** until M-089's Node pin makes its suite green. It is then marked Verified in M-089.

### 12.1 Milestones already Planned

| Planned | Disposition |
|---|---|
| M-058 Agent Surface v2 | Absorbed by M-091 |
| M-059 Reference Precision | Remaining scope runs inside M-096 |
| M-060 CI and PR | The action exists. Receipt-as-PR-comment folds into M-092. The rest is closed |
| M-061 Detection Quality | The parts the precision gate needs fold into M-097. The rest is deferred |
| M-062 UI Actionability | Superseded by the slim IDE (§10) |
| M-063 Distribution | Folded into M-098 + M-100 |
| M-080 Agent + CLI IA (HTTP `/mcp`) | Deferred; revisit after M-095 (the daemon is the natural HTTP host). No `app.prismate.io` |
| M-081 Marketplace publisher rename | **Cancelled** (D1) |
| M-082 One Dashboard package | Re-scoped into M-099 |
| M-083 Engine package merge | Deferred until after M-100 |
| M-084 Surfaces + IDE merge | Deferred |
| M-085 Docs trim | Split into M-090 (plans) and M-100 (public docs) |
| M-086 Website + demo + identity | Identity **cancelled** (D1). Website and demo fold into M-100 |

---

## 13. ADRs (Proposed with this program)

| ADR | Decision |
|---|---|
| [0060](../adr/0060-prism-keeps-its-name.md) | Prism keeps its name. Prismate is cancelled. Hero copy is relocked to DevX performance. Supersedes the identity and copy parts of ADR-0057 and PROGRAM_prism-2.0 §0 / §0.1 (Q-026, Q-027). |
| [0061](../adr/0061-workspace-build-everywhere.md) | Developing Prism uses the workspace build on every host: dev pack, `dev:link`, `doctor --surfaces`, Node 24.18.1. |
| [0062](../adr/0062-prism-graph-replaces-repository-map.md) | Prism Graph replaces the Repository Map with three jobs. Amends ADR-0057. |
| [0063](../adr/0063-prism-daemon-is-a-process.md) | The Prism daemon is a process, not an agent. Lifecycle, limits, attach-first, fallback. |
| [0064](../adr/0064-dispatch-removed.md) | Dispatch is removed from product, MCP and code. Completes ADR-0058's Jobs removal. `remember` moves to Iris. Envelope moves to its own package. |
| [0065](../adr/0065-auto-prepare.md) | Prepare is auto-injected on prompt submit: detection, budget, latency, opt-out, never blocking. |
| [0066](../adr/0066-envelope-product-surface.md) | Envelope is a product surface: sessions, budgets, calibrated "estimated saved", privacy. |

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Cursor does not run Claude-plugin hooks on the owner's version | `dev:link` writes `~/.cursor/hooks.json` from the same definition (ADR-0061) |
| Auto-Prepare adds noise | Conservative detection, an 800-token cap, an off switch, and Envelope makes the cost visible |
| Background indexing too heavy | Memory and CPU caps, battery pause, idle stop, in-process fallback |
| The A/B shows little gain | Publish anyway, fix Prepare / Graph from per-task data, revisit the hero before M-100 |
| Deleting Dispatch breaks something | Move first (M-091), delete last (M-099), `safe_delete` per export, suite after each step |
| Graph becomes "a map for the map's sake" again | It ships only with blast overlay, copy-as-prompt and `GRAPH_REPORT.md` |
| Baseline-aware receipt hides a real failure | Already-failing checks still print, on their own line. Only the `block` decision changes |
| Plan drift | Archive Verified docs; one-page milestones; this is the only active program |

---

## 15. Decisions locked (owner, 2026-10-10)

| Id | Decision |
|---|---|
| Q-1 | Gitignore the repo `opencode.json`. The global OpenCode config already points at this checkout. |
| Q-2 | **Node 24.18.1** for the build, CI's milestone job, and every host launch. |
| Q-3 | M-090 lists every `dispatch/*`, `cursor/*` and `chore/*` branch and the Dispatch worktrees, then deletes them. Keep none. |
| Q-4 | Do not push `main`. |
| Q-5 | Envelope ledger and prepare-last move into `@repo-prism/core`. |
| Q-6 | Prepare eval, receipt replay, and the Claude Code proof use: `toss/es-toolkit`, `colinhacks/zod`, `honojs/hono`, `trpc/trpc`, `vitest-dev/vitest`, `fastify/fastify`. First-run precision adds `nestjs/nest`, `vuejs/core`, `sveltejs/svelte`, `prettier/prettier`, `eslint/eslint`, `TanStack/query`, `reduxjs/redux-toolkit`, `date-fns/date-fns`, `expressjs/express`, `nodejs/undici`, `pmndrs/zustand`, `lodash/lodash`, `facebook/react`, `microsoft/playwright`. A repo that cannot run its tests offline is recorded and skipped, not replaced silently. |
| Q-7 | Hero: **"Faster agent sessions. Fewer broken builds."** Sub-line and kicker are program §1.1. |
| Q-8 | The graph daemon pauses indexing below 20% battery. |

No open product questions remain on this program. Q-024 (which repo is the public demo fixture) is answered by the first-run set: the demo fixture is `es-toolkit` unless a precision run shows it is a poor card, in which case the milestone records the swap.
