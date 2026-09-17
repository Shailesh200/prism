# M-074 — Bloat + Job Cost

| Field | Value |
|---|---|
| Status | **In Review** |
| Branch | `milestone/M-074-bloat-job-cost` (from latest `main`, M-073 merged) |
| Depends on | M-071 (finding loop), M-072 (Guard's `scoreReuse`/duplicate fix) |
| Packages | `shared`, `intelligence`, `core`, `cli`, `mcp-server`, `dispatch-hub` |
| Program | [PROGRAM_agent-native-3-PHASES.md](./PROGRAM_agent-native-3-PHASES.md) §5.2 |

## 1. Goal

Two independent Phase 2 Cut 2 capabilities:

1. **Bloat findings** — two new finding sources on the same M-071 finding
   loop: `duplicate_implementation` (two files export the exact same name)
   and `wrapper_over_existing` (a function whose whole body is one call to
   another export). Plus a mute list so a finding the user has decided not
   to fix stops resurfacing.
2. **Job cost** — the token usage every job already records
   (`JobRecord.tokenUsage`, M-065) rolled up into a daily chart on Pulse,
   honest about tokens vs. dollars.

## 2. In scope

### Bloat (B1/B2)

- **`duplicate_implementation`**: exact-name match only, not fuzzy.
  `checkGuardSession`'s duplicate check tried "shares a token" at session
  scope and flooded a large codebase with false positives
  (`fetchDna`/`fetchHealth`); at whole-repo scope that heuristic would be
  both slower and noisier. Exact name across different files is cheap
  (one group-by, no pairwise scoring) and near-zero false-positive, at the
  cost of missing differently-named near-duplicates — an intentional
  tradeoff for a repo-wide scan.
- **`wrapper_over_existing`**: detected structurally (reference range
  contained in symbol range), not by reading source text — exactly one
  call inside a short body, to a different exported symbol.
- Same `FindingRef` shape and `queue_finding` flow as `unused_export`.
- **Mute list**: `~/.prism/workspaces/<key>/finding-mutes.json` (same
  machine-wide workspace dir as cache/dispatch). Core
  `muteFinding`/`unmuteFinding`/`listMutedFindings`.
- **New gap closed, not spec'd but required**: there was no way to
  *discover* a finding via MCP before this milestone — `queue_finding`
  only works if the caller already has a `FindingRef`, and none of
  `engineering_health`/`security_report`/`testing_report`/`review_changes`
  actually carry one despite `instructions.ts` implying they do. Added
  MCP `list_findings` (read-only, excludes muted by default) to make the
  mute list — and every finding source — actually usable by an agent.
- Muting itself is **CLI-only** (`prism findings list/mute/unmute`), not
  an MCP tool: every Intelligence MCP tool is read-only by hard-enforced
  invariant (`packages/mcp-server/src/boundaries.test.ts`), and muting
  writes to disk. Same boundary that already kept bookmarks MCP-free.

### Job cost (K1/K2/K3)

- **K1**: `JobRecord.tokenUsage` already flows end-to-end into the hub
  snapshot as part of every `JobSummary` (confirmed in
  `packages/dispatch-hub/src/snapshot.ts`, predating this milestone). The
  "aggregate in the hub snapshot" requirement is satisfied by a pure
  client-side rollup (`aggregateTokensByDay`) over data already delivered
  — the same shape as `pulseSections`/`groupJobsByRepo`, not a new
  snapshot field.
- **K2**: a real chart (`AreaChart` from `@repo-prism/ui`, the same
  primitive already used elsewhere — not a new charting approach) on
  Pulse, showing daily token totals for the trailing 14 days. Hidden
  entirely until there is at least one non-zero day — an empty chart is
  worse than no chart. `estimateJobCost`/`estimateTotalCost` compute a
  dollar figure from an optional, purely local per-model price table and
  return `null` (never a fabricated `$0`) when a model has no price; wiring
  a real price-table *source* (a config file) is left for a follow-up —
  today nothing populates one, so the UI always shows tokens, which is the
  honest default state the spec asks for.
- **K3**: satisfied by construction — `aggregateTokensByDay` only reads
  `JobSummary.tokenUsage`, which only exists for jobs Prism itself ran.
  Nothing reads Cursor's or Claude's own session logs.

## 3. Out of scope

- Fuzzy/cross-name duplicate detection at repo scope (see B1 rationale).
- A price-table *loading* mechanism (reading a config file into
  `ModelPriceTable`) — the estimation functions exist and are tested, nothing
  wires a source to them yet.
- Muting via MCP (architectural boundary, see above).
- Any UI beyond Pulse's new chart (no Console settings screen for mutes).

## 4. Definition of Done

- [x] `duplicate_implementation` flags the later of two files exporting
      the same name; never a name overlap alone
      (`packages/intelligence/src/findings/findings.test.ts`,
      `packages/core/src/finding-loop.test.ts`)
- [x] `wrapper_over_existing` flags a single-call short body; not a
      function with two distinct calls
      (`packages/intelligence/src/findings/findings.test.ts`)
- [x] Mute list persists to `.prism/finding-mutes.json`, is idempotent,
      and a corrupt file is a real error, not silent data loss
      (`packages/core/src/finding-mutes.test.ts`)
- [x] MCP `list_findings` excludes muted fingerprints by default,
      `includeMuted` overrides (`packages/mcp-server/src/server.contract.test.ts`)
- [x] CLI `prism findings list/mute/unmute` round-trips a real fingerprint
      (`packages/cli/src/cli.integration.test.ts`)
- [x] `aggregateTokensByDay` zero-fills empty days, sums input+output+cache
      tokens, falls back to `createdAt` when `finishedAt` is absent, and
      excludes jobs outside the window
      (`packages/dispatch-hub/src/dashboard/job-cost.test.ts`)
- [x] `estimateJobCost`/`estimateTotalCost` return `null` rather than a
      fabricated `$0` when a model has no price (same file)
- [x] Pulse renders the cost chart only once real, non-zero token data
      exists (`pulse-view.tsx`)
- [x] `bun run verify:milestone` green

## 5. Design notes

- **Why `list_findings` wasn't scope creep**: B1 says "same `FindingRef` +
  `queue_finding` as M-071" — but M-071 never actually gave an agent a way
  to *get* a `FindingRef` via MCP. Adding a bloat source without a way to
  list it (and therefore mute it) would have shipped the same latent gap
  twice. Confirmed with the owner before building it (2026-09-17).
- **Why muting isn't an MCP tool**: `boundaries.test.ts` asserts
  `TOOLS.every((tool) => tool.readOnly !== false)` — a real, enforced
  invariant, not just a comment. Bookmarks (`saveBookmark`/`removeBookmark`,
  also `.prism/`-writing Core methods) were never exposed via MCP either,
  for the same reason. Mute follows that precedent: CLI, not MCP.
