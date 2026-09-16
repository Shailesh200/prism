# M-071 — Finding Loop

| Field | Value |
|---|---|
| Status | **Verified** |
| Branch | `milestone/M-071-finding-loop` (from latest `main`, M-070 merged) |
| Depends on | M-070 Verified |
| Unlocks | M-072 Prism Guard |
| Packages | `shared`, `intelligence`, `core`, `dispatch`, `mcp-server` |
| Program | [PROGRAM_agent-native-3-PHASES.md](./PROGRAM_agent-native-3-PHASES.md) §4.3 |

## 1. Goal

A finding is queueable and re-scannable. `queue_finding` hands one finding to
a background teammate with a "fix this only" brief. A job reaching `done` is
never enough on its own — resolution comes from re-running the originating
report and checking that the finding's fingerprint is gone.

## 2. In scope (this Cut)

- **L1** `FindingRef` DTO + stable fingerprint (`source|path|normalizedTitle`,
  hashed). First finding source: `unused_export` — an exported symbol with no
  inbound reference in the knowledge graph (never a test file or a barrel).
- **L2** MCP `queue_finding`: validates the finding against `FindingRefSchema`
  (never invents id/source/fingerprint), builds the job via the one shared
  `queueFindingArgs` payload builder, delegates to the same `start_job` path
  (admission, dirty-tree confirm, dashboard URL).
- **L3** Re-scan loop: `Core.resolveFinding` re-indexes and re-runs the
  finding sources; `dispatch.reconcileFindingResolutions` marks a finding job
  `resolved` / `open` once its verification has passed — never from job
  status alone, and never while verification is `failed` or unset. Wired
  into MCP `list_jobs`.
- **L5** PRD is always "fix this finding only", never the whole report.
- **L7** Server instructions: a finding stays open until re-scanned; offer
  `queue_finding` only if the user asks to fix it, not from a plain review.

## 3. Out of scope (deferred, not silently dropped)

- **L4** Pulse sparkline (finding count trend from health history) — needs
  the same dedicated Console/chart design pass M-069 S6 gave Iris. The data
  path (`listFindings`) is ready for it.
- **L6** Spectrum dots on the playground / website / IDE Map — three visual
  surfaces needing their own design; `queueFindingArgs` is ready to be their
  shared call site once built.
- A dedicated Console "Findings" report screen wired to a "Fix with
  teammate" button. The existing Console *Findings* view (job write-ups) is
  a different concept and is unchanged.
- More finding sources beyond `unused_export` (bloat/duplicate/wrapper
  sources are M-074).
- Guard, Living AGENTS.md, work-order `order`.

## 4. Definition of Done

- [x] Fixture: an unused export is flagged, and `resolveFinding` reports
      `resolved: false` before the fix, `true` once the export is deleted and
      re-indexed (`packages/core/src/finding-loop.test.ts`)
- [x] `reconcileFindingResolutions` marks `resolved`/`open` only once
      verification has passed; a failed or unset verification never triggers
      a re-scan (`packages/dispatch/src/finding-resolve.test.ts`)
- [x] `queue_finding` refuses a finding missing id/source/fingerprint instead
      of inventing one; a well-formed finding reaches the same `start_job`
      path (`packages/dispatch/src/runtime.test.ts`,
      `packages/mcp-server/src/dispatch-registry.test.ts`)
- [x] `queueFindingArgs` is the single payload builder every entry point
      must use (`packages/shared/src/schemas.test.ts`)
- [x] Server instructions keep a finding open until re-scan and gate
      `queue_finding` on the user asking to fix it
      (`packages/mcp-server/src/instructions.test.ts`)
- [x] `bun run verify:milestone` green
- [x] Owner review before commit
