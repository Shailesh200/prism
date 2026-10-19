# Prism 2.x next plan: fewer tokens, better ranking, habits

Plan only. Grounded in `08e4d3c` (Prism 2.0, local). Rules: proper solutions, no hacks, no overengineering, no backward compatibility.

## Where we are
| Metric | Now | Target after this plan |
|---|---|---|
| B1 orientation tokens, with vs without Prism | 36,230 vs ~7.9k (**4.6×**) | **≤ 1.0×** (release gate, P14) |
| B4 golden top-3 (220 tasks) | **38.6%** | **≥ 55%** |
| B4 recall@pack | 54.1% | ≥ 70% |
| B3 catch / false alarms | 0.625 / 0% | ≥ 0.625 / 0% |

Main token sinks seen in B1 and the profile: `prepare_change` returns whole files and house-style excerpts (`intelligence/src/prepare/pack.ts`); no per-tool token cap (Envelope only measures); every call resends the same context; agents still `Read` files Prism has already summarised.

MCP surface: 9 default tools today (`shared/src/tool-names.ts`) and **9 after this plan** (owner decision): `review_changes` merges into `guard_session` (P12), `habits` is added (P15), `receipt` stays opt-in.

## Shared building blocks (used by several points)
- **Token estimate:** one `estimateTokens(text)` in `shared/src/tokens.ts` (chars/3.6, calibrated against B1 once; ±10%). Replaces ad-hoc estimates in Envelope.
- **Session store:** `~/.prism/sessions/<sessionId>.json` (daemon-owned, 24 h TTL, pruned by `data-prune`). Holds what was sent (P4), what was suggested (P6), and the estimated tokens saved (P13).

---

## P1 Compact cached repo map
- **Goal:** one small, cached text an agent reads instead of opening files: symbols, signatures, call graph, per package. Graphify-style.
- **Design:** `repo_map` mode inside `graph` (no new tool): `graph {mode:"map", scope?, maxTokens?}`. Built from the existing knowledge graph (`intelligence/src/semantic/build.ts`) plus dependency graph. Output per file: path, exported signatures (one line each), top callees/callers (≤3). Ranked by PageRank over the call graph + recent git activity; truncated by P3. Cached at `~/.prism/workspaces/<id>/map.v1.txt`, keyed by index snapshot hash; rebuilt incrementally per changed file by the daemon `onIndexed` (debounced like the hook snapshot).
- **Files:** `intelligence/src/map/{build,render}.ts` (new), `core/src/workspace.ts` (`repoMap()`), `core/src/graph-query.ts` (mode), `mcp-server/src/tools/graph.ts`, `mcp-server/src/daemon.ts`, `cli/src/commands/graph.ts` (`prism graph map`).
- **Tests:** MAP-1 deterministic output for a fixture; MAP-2 only changed files re-render; MAP-3 respects maxTokens and keeps highest-rank files; MAP-4 signatures have no bodies; MAP-5 cache invalidates on snapshot change.
- **Metric:** map for es-toolkit ≤ 4k tokens at default budget; build ≤ 1.5 s medium fixture, incremental ≤ 100 ms; B1 file reads −50%.
- **Risks:** stale cache (mitigated by snapshot key); signatures of overloaded/generic TS can be long (clip at 160 chars).
- **Effort:** M (4–5 d).

## P2 Signature-only context in prepare_change, lazy bodies
- **Goal:** prepare returns signatures and line anchors, not file bodies.
- **Design:** `pack.ts` emits for each ranked file: signature block + `path:line` anchors. Bodies only for the top-1 symbol when it is ≤ 40 lines. A follow-up `graph {mode:"symbol", id, body:true}` returns one body on demand. Drop the house-style excerpt from the default pack (keep a one-line pointer).
- **Files:** `intelligence/src/prepare/pack.ts`, `shared/src/prepare-context.ts`, `shared/src/prepare-trimmed.ts`, `core/src/graph-query.ts` (symbol body), `mcp-server/src/tools/prepare.ts`, skills text in `plugin/`.
- **Tests:** PREP-S1 no body > 40 lines in a pack; PREP-S2 every signature has a resolvable anchor; PREP-S3 body fetch returns exact source range; PREP-S4 B2/B4 recall@pack unchanged (±1 pt).
- **Metric:** prepare avg tokens −60% (from ~7.7k); B4 recall@pack no drop.
- **Risks:** agent makes an extra call for a body (net still cheaper; measured in B1).
- **Effort:** M (3 d).

## P3 maxTokens per tool with ranked truncation
- **Goal:** every tool honours a token budget and cuts the lowest-ranked items first, saying what was cut.
- **Design:** one `truncateRanked(items, rank, maxTokens)` in `shared/src/budget.ts`; every tool's result already is a list (files, symbols, findings) — each tool supplies its ranker. Default budgets in the existing Envelope budget table (`core/src/envelope/budgets.ts`), now enforced not just measured. Optional `maxTokens` arg on every default tool. Footer: `truncated: 12 more (ask with offset)`.
- **Files:** `shared/src/budget.ts` (new), `core/src/envelope/budgets.ts`, each `mcp-server/src/tools/*.ts`, `shared/src/schemas.ts`.
- **Tests:** BUD-1 output ≤ maxTokens (±5%) for each default tool; BUD-2 highest-ranked items survive; BUD-3 truncation footer present and accurate; BUD-4 offset paging returns the rest exactly once.
- **Metric:** no default tool response over its budget in B1/B6 (Envelope over-budget count = 0).
- **Risks:** budgets too tight hide needed info → tuned with B4/B1 together.
- **Effort:** S–M (2–3 d).

## P4 Session memory dedupe
- **Goal:** do not resend context the agent already has this session.
- **Design:** session store records `{fileHash or symbolId → turn}` for everything sent. Later responses replace repeats with a reference: `src/a.ts (sent earlier, unchanged)`. A changed file (hash differs) is resent. Session id comes from the existing session-start hook. No session id → no dedupe.
- **Files:** `shared/src/session-store.ts` (new), `daemon/src/server.ts` (owner), `mcp-server/src/tools/{prepare,graph,impact}.ts`, `plugin/hooks/prism-hook.mjs` (pass id).
- **Tests:** SES-1 second identical prepare is ≥ 70% smaller; SES-2 edited file is resent; SES-3 different sessions don't share; SES-4 TTL prune; SES-5 store has hashes/ids only, no content (privacy).
- **Metric:** B1 repeated-call tokens −50%.
- **Risks:** context compaction in the host drops earlier content while Prism thinks it was sent → `refresh:true` arg and reset on the host's compaction event where available (Claude Code `PreCompact` hook).
- **Effort:** M (3 d).

## P5 Strength setting and trivial-edit skip (absorbs: strength setting)
- **Goal:** the user picks how much Prism does, and trivial prompts get nothing.
- **Design:** `prism lite|full|off` writes `strength` to `~/.prism/config.json` (per repo override in `.prism/config.json`). `full` = today's behaviour. `lite` = ruleset (P16) + receipt only, no auto-Prepare. `off` = hooks exit at once, MCP tools still answer when called. Independently, the classifier (`shared/src/classify-prompt.ts`) gains a `trivial` class (rules + owner corpus + 40 labelled trivial prompts); in `full`, trivial prompts get no injection and no auto-Prepare; the stop receipt still runs.
- **Files:** `shared/src/user-config.ts`, `shared/src/prism-config.ts`, `cli/src/commands/strength.ts` (new), `shared/src/classify-prompt.ts`, `plugin/hooks/{classify-prompt,prism-hook}.mjs`, `scripts/bench/classifier-eval.mjs`, `cli/src/commands/doctor.ts` (shows strength).
- **Tests:** STR-1 each level sets config; STR-2 `off` hook exits < 50 ms with no output; STR-3 `lite` injects only the ruleset; STR-4 repo override wins; CLS-T1…T10 trivial examples; CLS-T11 B7 change recall stays ≥ 0.99; HOOK-T1 no injection on trivial.
- **Target:** trivial precision ≥ 0.95; prompt-hook tokens on trivial prompts = 0; `lite` B1 tokens ≤ 0.5× `full`.
- **Risks:** a misclassified prompt loses context → precision-first threshold.
- **Effort:** S–M (2–3 d).

## P6 Learn from real edits
- **Goal:** rank files the user actually edits for a kind of task higher.
- **Design:** per session record `suggested` (top-10 from prepare) and `edited` (from the stop receipt). Store per repo in `~/.prism/workspaces/<id>/feedback.jsonl` (paths + task terms, no content). Ranking feature: smoothed hit rate per file and per (term, file) pair, added as one weighted feature in `intelligence/src/prepare/rank.ts`. Weight fit offline on B4 held-out; capped so it cannot dominate.
- **Files:** `intelligence/src/prepare/rank.ts`, `shared/src/feedback-store.ts` (new), `mcp-server/src/safety/receipt-service.ts`, `cli/src/commands/data-prune.ts`.
- **Tests:** FB-1 receipt writes one feedback row; FB-2 no file content stored; FB-3 feature raises a repeatedly-edited file; FB-4 weight cap; FB-5 B4 held-out not worse.
- **Metric:** B4 top-3 +5 pts on repos with history (simulate by replaying golden train split).
- **Risks:** feedback loop (suggested → edited because suggested) → only count edits to files *not* in top-3 as positive extra signal; decay 30 days.
- **Effort:** M (3 d).

## P7 Git co-change ranking
- **Goal:** files that change together with the seed files rank higher.
- **Design:** from `core/src/git/git-signals.ts` (already reads ≤ 2000 commits), build a co-change matrix (Jaccard over commits, ignore commits > 30 files). Cached with git HEAD. Feature in `rank.ts`; also used by test_impact for tests that co-change with the source.
- **Files:** `core/src/git/co-change.ts` (new), `core/src/git/git-signals.ts`, `intelligence/src/prepare/rank.ts`, `impact/src/change-impact.ts`.
- **Tests:** CC-1 matrix on a fixture repo; CC-2 big commits ignored; CC-3 cache keyed on HEAD; CC-4 shallow clone → feature off, no error.
- **Metric:** B4 top-3 +6 pts, testRecall +5 pts.
- **Risks:** monorepo noise → per-package normalisation.
- **Effort:** S–M (2 d).

## P8 Member-level usage for namespace imports
- **Goal:** `import * as x from 'mod'` binds only the members actually used (`x.debounce`), not every export. Fixes the known es-toolkit blast/test over-count.
- **Design:** analyzer records member accesses on namespace bindings (`x.foo`, `x['foo']`); a dynamic access (`x[k]`) or passing `x` as a value falls back to "all members". Edges carry `members[]`; blast and test_impact filter by symbol.
- **Files:** `analyzer/src/typescript-plugin.ts`, `intelligence/src/dependency/build.ts`, `impact/src/blast-radius.ts`, `impact/src/change-impact.ts`, EXTRACTION_VERSION bump.
- **Tests:** NS-1 member access recorded; NS-2 computed access → all; NS-3 escape as value → all; NS-4 es-toolkit debounce blast ≤ 15 files (from 38); NS-5 test_impact precision up on es-toolkit compat.
- **Metric:** B4 testPrecision +8 pts; B4 blastPrecision +10 pts.
- **Risks:** under-count if an escape case is missed → conservative fallback.
- **Effort:** M (3 d).

## P9 Confidence and explain-why on every pick (absorbs: explain-why reasons)
- **Goal:** each picked file/symbol/test says why it was picked and how sure Prism is.
- **Design:** every ranked item carries `why` (top 1–2 ranking features in words, e.g. "imports debounce; co-changes 8× with seed") and `confidence: high|medium|low` from evidence already present: measured vs heuristic edges (`provenance`), unresolved imports, dynamic-access fallback (P8), index freshness. Reasons come straight from `rank.ts` feature contributions; no ML. Counted in the P3 budget (≤ 12 tokens per item).
- **Files:** `intelligence/src/prepare/rank.ts` (expose contributions), `shared/src/provenance.ts`, `shared/src/schemas.ts`, tools `prepare/graph/impact/guard`.
- **Tests:** WHY-1 every item in prepare/test_impact/blast has a non-empty reason; WHY-2 reason names the top contributing feature; CONF-1 all-measured → high; CONF-2 unresolved import → medium with reason; CONF-3 stale index → low; CONF-4 schema contract.
- **Target:** B4 top-3 accuracy on `high` items ≥ 80%; reasons add ≤ 10% tokens.
- **Risks:** verbosity → fixed short phrases.
- **Effort:** S–M (2 d).

## P10 test_impact gives the exact run command
- **Goal:** test_impact returns a ready command: `npx vitest run a.test.ts b.test.ts` / `jest --runTestsByPath …` / `bun test …`, scoped to the package.
- **Design:** reuse `checks` runner detection (`resolveScopedPlan`) — already resolves runner and package root. Output `{cwd, command, argv}` per package. No execution (read-only).
- **Files:** `impact/src/test-runner.ts`, `checks/src/*` (export plan), `mcp-server/src/tools/impact.ts`.
- **Tests:** TRC-1 vitest; TRC-2 jest; TRC-3 bun; TRC-4 monorepo two packages → two commands; TRC-5 unknown runner → none + reason; TRC-6 Yarn PnP uses `yarn vitest`.
- **Metric:** command runs green on es-toolkit/hono/portpilot golden tasks ≥ 90%.
- **Risks:** custom test scripts → fall back to package script name.
- **Effort:** S (1–2 d).

## P11 Verdict-first receipt with cheapest proof (absorbs: SHIP/NO-SHIP verdict)
- **Goal:** the receipt opens with one verdict, then findings ordered by how much evidence agrees, and `not_proven` names the cheapest check to prove it.
- **Design:** first line `SHIP`, `NO-SHIP` or `NOT PROVEN` (maps today's `proven/failed/not_proven`; NO-SHIP only for a caused failure or a high-severity flag). Findings grouped "agreed by ≥ 2 sources" (e.g. failing test + Guard flag on the same file) before "single source". For `NOT PROVEN`: rank candidate checks by recorded duration (receipt store) and coverage of touched files; print `run: <command> (~4 s) to prove src/a.ts`.
- **Files:** `mcp-server/src/safety/receipt.ts`, `shared/src/receipt.ts`, `shared/src/receipt-render.ts`, `shared/src/receipt-store.ts`.
- **Tests:** RV-1 verdict is line 1 for each state; RV-2 multi-source findings first; RV-3 already_failing never yields NO-SHIP alone; NP-1 untested source → nearest test or typecheck; NP-2 uses recorded durations; NP-3 suggestion is runnable.
- **Target:** B3 false alarms stay 0%; every NOT PROVEN has a runnable suggestion.
- **Risks:** a wrong NO-SHIP erodes trust → only caused failures/high flags.
- **Effort:** S–M (2 d).

## P12 Merge review_changes into guard_session
- **Goal:** one tool for "check my changes".
- **Design:** `guard_session {review?: true}` adds the review_changes output (risk, affected pages, lens). Delete `review_changes` (no compat). Update skills, instructions, deleted-names lint list.
- **Files:** `mcp-server/src/tools/guard.ts`, delete review parts of `tools/*`, `mcp-server/src/safety/review-extras.ts`, `shared/src/tool-names.ts`, plugin skills, `scripts/check-deleted-names.mjs`.
- **Tests:** GRD-R1 review fields present with `review:true`; GRD-R2 tools/list has no review_changes; GRD-R3 skills-tools contract passes; RC-1…RC-n scenarios re-pointed.
- **Metric:** default tool count 9 → 8 (→ 9 with habits).
- **Effort:** S (1–2 d).

## P13 Visible value line in the stop receipt (absorbs: per-session value note)
- **Goal:** one honest line per session: tokens saved and issues caught.
- **Design:** `Prism this session: ~N tokens saved (estimate), 2 issues caught, 1 check suggested.` Tokens: Prism-sent vs calibrated without-Prism reads (files covered × avg read size, calibrated on B1/B6). Issues caught = NO-SHIP findings the agent then fixed before stop. Shown as "not calibrated" until calibration (ADR-0066 rule); shows cost when Prism cost more.
- **Files:** `core/src/envelope/*`, `shared/src/receipt-render.ts`, session store, `cli/src/commands/envelope.ts`.
- **Tests:** VAL-1 "not calibrated" before calibration; VAL-2 deterministic for a recorded session; VAL-3 negative savings shown as cost; VAL-4 caught-count only counts fixed findings.
- **Target:** estimate within ±25% of measured B6 delta.
- **Effort:** S (1–2 d).

## P14 Published token, cost and time proof as a release gate (absorbs: published with/without benchmark)
- **Goal:** Prism cannot ship unless it is measurably cheaper, and the proof is public.
- **Design:** gate: `B1.ratio ≤ 1.0` and B6 A/B (Claude Code + opencode, n ≥ 10 per arm, fixed task set from public golden repos) with medians of total tokens, $ cost (host-reported) and wall time; with-Prism must be ≤ without on tokens and cost, success not lower. Results written to `docs/benchmarks/2.x.md` (public repos only, no rentmaadi) with method and raw JSON. Isolated HOME with only the host auth file copied in (owner consent).
- **Files:** `scripts/bench/gate.mjs`, `scripts/bench/agent-orientation.ts`, `scripts/bench/agent-ab.ts`, `scripts/bench/publish-proof.mjs` (new), `docs/benchmarks/`.
- **Tests:** GATE-T1 ratio > 1 fails; GATE-T2 missing B6 fails at release; GATE-T3 published file has no private repo names; GATE-T4 report regenerates byte-identical from raw JSON.
- **Target:** gate green at release; published proof page.
- **Risks:** A/B variance → n ≥ 10, medians; real credits (owner OK'd).
- **Effort:** M (2–3 d) + run time.

## P15 `habits` tool (user-configurable routines)
- **Goal:** the user names a routine once ("start my day") and any agent can run it via Prism, which returns the steps; the agent does the fetching with its own connected MCP tools.
- **Design:**
  - **Storage:** `~/.prism/habits.json` (mode 0600), schema-versioned:
    ```json
    {"version":1,"habits":[{"name":"start my day","description":"Morning standup prep",
      "steps":[{"source":"github","action":"list my open PRs and review requests","filter":"repo:Shailesh200/prism"},
               {"source":"linear","action":"list my in-progress and todo issues"},
               {"source":"notion","action":"read page 'Daily notes' for today"}],
      "output":{"format":"standup","template":"Yesterday / Today / Blockers, ≤ 10 bullets"}}]}
    ```
  - **CLI:** `prism habit add <name> --step "github: list my open PRs" … --output standup`, `prism habit list`, `prism habit show <name>`, `prism habit edit <name>` (opens `$EDITOR` on that habit, re-validated on save), `prism habit remove <name>`. `--json` on all.
  - **MCP tool `habits`:** `{name?}` → no name: list names + descriptions; with name: resolved, ordered instructions: steps (source, action, filter), output format, and a short preamble ("use your connected tools for each source; if a source is not connected, say so and continue"). Fuzzy name match (case/space-insensitive), exact match wins.
  - **Read-only:** Prism makes no network calls and executes nothing; it returns text. `source` is a free label plus a known list (github, linear, notion, slack, gmail, calendar, jira) used only for hints.
  - **Validation (zod in `shared/src/habits.ts`):** name 1–60 chars unique; 1–20 steps; action ≤ 300 chars; output format ∈ {standup, summary, checklist, table, free} + template ≤ 500 chars.
  - **Security:** reject secrets on add/edit: patterns for tokens/keys (`sk-`, `ghp_`, `xox[bp]-`, `lin_api_`, `secret_`, JWT, `Bearer `, long hex/base64 > 32 chars), and URLs with credentials. File 0600; never logged to events/Envelope (only habit name + step count). Habits never contain tool credentials: auth stays with the host's MCP connections.
  - **Lenses-style location:** global only (`~/.prism`), like lenses.
- **Files:** `shared/src/habits.ts` (schema, store, secret scan), `cli/src/commands/habit.ts`, `mcp-server/src/tools/habits.ts`, `shared/src/tool-names.ts` (default list), `plugin/` skill `habits.md`, `cli/src/commands/doctor.ts` (habits file check).
- **Tests:** HAB-1 add/list/show/remove round-trip; HAB-2 edit re-validates; HAB-3 duplicate name rejected; HAB-4 secret patterns rejected (table of 10 samples) with no echo of the secret; HAB-5 file mode 0600; HAB-6 tool with no name lists habits; HAB-7 tool returns ordered steps + output; HAB-8 fuzzy name; HAB-9 unknown name → list of near names; HAB-10 no network (no-network test harness); HAB-11 events log has no step text; HAB-12 tools/list = 9 default tools, contract test updated.
- **Examples shipped in docs (not pre-installed):** `start my day` (above), `end my day` (merged PRs + closed issues today → summary), `review queue` (PRs requesting my review → table with age/size), `release check` (open issues labelled release + CI status → checklist).
- **Metric:** `habits` response ≤ 600 tokens; zero secrets in a fuzzed add run.
- **Risks:** users paste tokens → secret scan + doc; scope creep to "Prism runs the steps" → explicitly out of scope (ADR).
- **Effort:** M (3 d), plus ADR-0068 "habits: Prism returns routines, agents execute".


## P16 Compact always-on ruleset, cache-friendly output
- **Goal:** replace large injected context with a short stable ruleset, and order every output so host prompt caches hit.
- **Design:** one ruleset (≤ 300 tokens: when to call which tool, receipt rules) injected at session start only, not per prompt. Every tool output is ordered stable-first: fixed header/ruleset, then repo-level content keyed by index hash (map, P1), then the per-call part last; no timestamps or random ids in the stable part.
- **Files:** `plugin/` rule file + `prism-hook.mjs` (session vs prompt), `mcp-server/src/instructions.ts`, tools' renderers.
- **Tests:** RULE-1 ruleset ≤ 300 tokens; RULE-2 prompt hook no longer repeats it; CACHE-1 two calls on an unchanged repo share an identical prefix ≥ 70% of bytes; CACHE-2 no volatile fields in the prefix.
- **Target:** prompt-hook tokens −70%; B6 cached-input share up (host-reported).
- **Risks:** agent forgets rules mid-session → re-inject after compaction (PreCompact hook).
- **Effort:** S (1–2 d).

## P17 Warm daemon, hook p95 under 1 s
- **Goal:** prompt and stop hooks answer in < 1 s p95 (now 4.2 s / 2.3 s).
- **Design:** session-start hook starts/attaches the daemon and pre-warms the repo (index, graphs, map). Prompt hook does only classify + one daemon call with a 900 ms deadline; on deadline it returns the ruleset and lets the agent call `prepare_change` itself (no blocking). Stop hook shows the structural receipt at once; checks run in the daemon and land via `receipt` (opt-in) or next prompt.
- **Files:** `plugin/hooks/prism-hook.mjs`, `daemon/src/{server,pool}.ts`, `mcp-server/src/daemon.ts`, `scripts/bench/hook-latency.mjs`.
- **Tests:** HOOK-P1 prompt p95 < 1 s on hookbench; HOOK-P2 deadline path returns ruleset; HOOK-P3 stop p95 < 1 s; HOOK-P4 daemon crash → hooks degrade with an event, no hang.
- **Target:** B8 prompt p95 < 1 s, stop p95 < 1 s (C-14 ceilings tightened to 1 s after owner approval).
- **Risks:** memory of a resident daemon on 8 GB Macs → existing RSS ceiling (1.6 GB) and idle eviction.
- **Effort:** M (3 d).

## P18 Structured findings
- **Goal:** every finding says what goes wrong, the fix, and the risk of skipping it.
- **Design:** one `Finding` shape in `shared/src/schemas.ts`: `{what, where, fix, riskIfSkipped: low|med|high, sources[]}` used by Guard, lenses and receipt (sources feed P11 agreement). Existing finding producers map into it; no free-form findings.
- **Files:** `shared/src/schemas.ts`, `intelligence/src/findings/*`, `mcp-server/src/safety/{lens-checks,receipt}.ts`, `shared/src/receipt-render.ts`.
- **Tests:** FND-1 every producer emits all fields; FND-2 fix text is non-empty and ≤ 160 chars; FND-3 schema contract; FND-4 sources list matches producers.
- **Target:** 100% of findings structured; no token growth (> 5%) on receipts.
- **Effort:** S–M (2 d).

## P19 Fast onboarding: one command, first answer < 60 s
- **Goal:** `prism start` installs for detected hosts, indexes, and prints a first useful answer in under 60 s.
- **Design:** `prism start` = detect installed hosts → `prism install <each> --local` → index in the daemon → print the repo map top (P1) + "try: prepare_change 'your task'". Large repos: print the answer from a partial index (top packages first) and finish in the background.
- **Files:** `cli/src/commands/start.ts` (new), `cli/src/install/hosts.ts`, `cli/src/commands/first-run.ts` (folded in), docs README.
- **Tests:** ONB-1 fresh HOME, es-toolkit: answer < 60 s; ONB-2 no hosts → clear message, index still runs; ONB-3 re-run is idempotent; ONB-4 partial-index path on medium fixture.
- **Target:** time-to-first-answer < 60 s on es-toolkit and the medium fixture (M1, 8 GB).
- **Effort:** S–M (2 d).


## P20 Docs and website match 2.0
- **Evidence:** `apps/website/app/(home)/page.tsx` and `products/page.tsx` still import 1.x `guard-theater`/`question-led`; `components/home-hero.tsx:119` shows `npx -y @repo-prism/cli doctor`; `mcp-install-panel.tsx` offers a VS Code install (extension deleted in 2.0); `docs/start/quickstart.md:10` says to prefix with `npx -y @repo-prism/cli`; `review_changes` named in `docs/usage.mdx`, `guides/review-a-pr.mdx`, `reference/capabilities.md`.
- **Why:** a new developer follows the site/docs first; today they install the wrong thing or call tools that won't exist after P12.
- **Design:** rewrite home/products sections around the 2.0 flow (`prism start`, receipt, prepare); delete stale components (`guard-theater`, `product-window`, `question-led` and any now-unused theaters); docs pages regenerated from `shared/src/tool-names.ts` for the tool list; one 2.0 release post. Extend `check-deleted-names` and `check-no-published-refs` to cover `apps/website/{app,components}` and `docs/` (posts stay excluded as history).
- **Files:** `apps/website/app/**`, `apps/website/components/**`, `docs/**`, `scripts/check-deleted-names.mjs`, `scripts/check-no-published-refs.mjs`.
- **Tests:** DOC-W1 website build passes with stale components deleted; DOC-W2 lint fails on `review_changes`/`npx …@latest` in docs/site; DOC-W3 docs tool list equals `DEFAULT_TOOL_NAMES`.
- **Target:** zero stale names/commands in site and docs (lint-enforced).
- **Risks:** copy churn → only 2.0 facts, no new marketing scope.
- **Effort:** M (3 d).

## P21 Release proof: install matrix and GitHub Action v2
- **Evidence:** change report "Pending CI at release": B10 install matrix (baseline 0 cells pass, not re-run on 2.0) and Action v2 on a real PR (fork and shallow-clone) never run. `.github/workflows/verify.yml` runs unit tests on Windows/macOS/Linux, but no host install there.
- **Why:** install is where most first-run failures happen (R-A1 was exactly this); Windows hook commands and paths are untested end to end.
- **Design:** B10 as a CI job: OS × {claude, opencode, cursor, codex config only} → `prism install` in a temp HOME, `prism doctor` must be ok, hook command executed once with a sample payload. Action v2 exercised on a test PR in a fork and with `fetch-depth: 1`.
- **Files:** `.github/workflows/verify.yml` (install job), `scripts/bench/install-matrix.mjs`, `action/` (if fixes needed).
- **Tests:** B10 cells (OS × host) all pass; ACT-1 fork PR comment posted; ACT-2 shallow clone → receipt with co-change (P7) off, no error.
- **Target:** B10 all cells pass; release blocked otherwise (added to gate).
- **Effort:** M (2 d) + CI runs.

## P22 Deterministic test suite
- **Evidence:** change report open risks: daemon debounce timing test flaky under load (`packages/daemon/src/server.test.ts`, `debounceMs: 50`); `testTimeout: 30_000` raised in core, daemon, mcp-server and shared `vitest.config.ts`.
- **Why:** flaky tests hide real regressions and train people to re-run; 30 s timeouts hide slow paths.
- **Design:** debounce tests use fake timers (`vi.useFakeTimers`) and an injected clock; find the tests that needed 30 s (vitest `--reporter=verbose` durations), make them use small fixtures or move them to `*.integration.test.ts` with an explicit per-test timeout; restore the default timeout elsewhere.
- **Files:** `packages/daemon/src/server.test.ts`, the four `vitest.config.ts`, any slow tests found.
- **Tests:** FLK-1 full suite 20× in a loop with CPU stress (`stress-ng` or parallel builds) → 0 failures; FLK-2 no unit test > 5 s.
- **Target:** zero flakes in 20 stressed runs.
- **Effort:** S (1–2 d).

## P23 Large-repo memory proof
- **Evidence:** B9 only ran small/medium; medium peak RSS 1.56 GB vs the 1.6 GB C-14 ceiling (97%) on an 8 GB M1; the `large` (50k files) budget exists in `scripts/bench/budgets.json` but was never measured. P1 (map), P4 (session store) and P17 (warm daemon) all add resident state.
- **Why:** big monorepos are where Prism is most useful and most likely to swap or be killed.
- **Design:** run B9 `large` on the 8 GB machine; profile heap at peak; fix the top retainer (expected: knowledge graph + dependency graph held together) by dropping built graphs after the snapshot write and rebuilding lazily; add a `large` RSS ceiling to the gate.
- **Files:** `scripts/bench/run.mjs`, `scripts/bench/gate.mjs`, likely `intelligence/src/prepare/graph-cache.ts`, `daemon/src/pool.ts`.
- **Tests:** MEM-1 large index completes on 8 GB; MEM-2 gate ceiling for large; MEM-3 medium stays ≤ 1.6 GB after P1/P4/P17.
- **Target:** large completes, RSS ≤ 3 GB; medium ≤ 1.6 GB with headroom ≥ 10%.
- **Effort:** S–M (2 d) + runs.

## P24 Envelope ledger: rotate and drop the 1.x fallback
- **Evidence:** `core/src/envelope/envelope-ledger.ts:9,19` still reads the legacy per-repo `{repo}/.prism/envelope-ledger.jsonl` (violates "no backward compatibility"); unlike `events.jsonl` (rotates at 5 MB, `shared/src/events.ts`) the ledger never rotates and `data-prune` keeps it.
- **Why:** unbounded growth in `~/.prism` on long-lived machines; P4/P13 will read it every session.
- **Design:** reuse the events rotation helper (5 MB × 3); delete the legacy fallback path and its constant.
- **Files:** `core/src/envelope/envelope-ledger.ts`, `shared/src/events.ts` (export rotate), tests.
- **Tests:** ENV-R1 rotates at limit and keeps 3; ENV-R2 legacy path never read; ENV-R3 deleted-names lint lists `ENVELOPE_LEDGER_REL`.
- **Target:** ledger ≤ 20 MB total.
- **Effort:** S (0.5 d).

---

## Ordering and phases
| Phase | Points | Why first | Effort |
|---|---|---|---|
| A. Measure, cap, stabilise | P22, P14 (wired warn-only until E), P3, P24, shared token estimate | Trustworthy tests and gate before changing behaviour | ~7 d |
| B. Cut tokens & latency | P16, P2, P1, P4, P5, P17, P23 | Biggest B1 and hook-latency wins; P23 checks their memory cost | ~19 d |
| C. Rank better | P8, P7, P6, P9 | B4 gains; P9 reasons come from the new features | ~10 d |
| D. Tool surface & receipt | P12, P15, P18, P11, P10, P13 | Surface changes once, after content is stable | ~11 d |
| E. Onboard, docs & release | P19, P20, P21, P14 enforced + published proof, full B1–B10 + A/B, change report | | ~9 d + runs |

**Total: ~56 working days** plus benchmark and CI run time. Each phase ends with build, lint, typecheck, full tests and the gate.

## Audit: considered and not added (already covered, with evidence)
- Index corruption / crash recovery: corrupt DB set aside and rebuilt (`indexer/src/cache/cache.integration.test.ts:50`).
- Concurrent agents/sessions on one index: writer test with `PRAGMA quick_check` (`indexer/src/cache/concurrency.integration.test.ts`); atomic temp+rename writes in receipt and lens stores.
- Uninstall/cleanup: `prism uninstall` removes exactly what install added (`cli/src/install/hosts.ts`).
- Config validation: zod `safeParse` in `shared/src/user-config.ts`, `prism-config.ts`.
- Path traversal: tool paths checked against the root (`mcp-server/src/paths.ts`, `safety/baseline.ts`).
- Privacy/telemetry: no network calls in `packages/*/src`; website analytics are site-only.
- Error handling: no-silent-catch lint + event log (2.0).
- Monorepos/workspaces: package discovery and the `mono` golden repo cover it; P7 adds per-package normalisation.
- Windows: unit tests already run on `windows-latest`; host install end to end is added via P21.
- Upgrade from 2.0.x: `version.json {major:2}` + index `schemaVersion`/EXTRACTION_VERSION rebuild; new stores (P4, P15) are schema-versioned in their points.
- Habits secrets: P15. Claude Code A/B: P14. Namespace over-count: P8.

## Expected impact
- **B1 tokens (4.6× → ≤ 1.0×):** P2 −60% on prepare, P1 replaces most file reads, P4 −50% on repeats, P3 caps outliers, P5 removes trivial-prompt injections, P16 cuts the per-prompt context and raises cache hits. Estimated with-Prism ≈ 7–9k vs ~7.9k without in the B1 script; real agent sessions (B6) should go below 1.0× because file reads drop.
- **B4 top-3 (38.6% → ≥ 55%):** P7 +6 pts, P6 +5 pts, P8 +3 pts (less noise in seeds), P1 map ranking +2 pts; recall@pack 54% → ≥ 70%, testPrecision +8 pts (P8, P10).
- **Risk to B3:** none expected; P12 keeps all Guard flags and checks.
