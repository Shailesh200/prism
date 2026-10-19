# M-092 — Receipt v2

| Field | Value |
|---|---|
| Status | **Built, not verified** — B3 replay open (round 4) |
| Branch | `milestone/M-092-receipt-v2` (from latest `main`) |
| Depends on | M-091 Verified |
| Unlocks | M-093 |
| Packages | `mcp-server/src/safety` (`receipt.ts`, `hook-command.ts`, `snapshot.ts`), `plugin/hooks/prism-hook.mjs`, `shared/src/receipt.ts`, `checks`, `cli` (`prism receipts`), `action/render-comment.mjs` |
| ADR | none new (ADR-0058 §2 stands) |


## Status (17 Oct 2026)

- **Built:**
  - Baseline-aware verdict with session scope.
  - Verdict first: `SHIP` / `NOT PROVEN` / `NO-SHIP` with the cheapest proof (next plan P11).
  - Structured findings (P18).
  - `prism receipts` with `--as markdown|svg` (`cli/src/commands/receipts.ts`).
  - The PR comment in `action/render-comment.mjs`.
- **Round 3:** the baseline re-run now happens in a throwaway copy, so it can no longer overwrite the agent's edits (change report, round 3, item 3a).
- **Round 4 (running):** the B3 replay benchmark, which has been skipped since round 2 because this checkout has no script to re-create it.

## 1. Goal

The receipt is correct, scoped to the session, and blocks the agent only for failures this change caused. It is also readable in a terminal, a PR comment and an image. Program §3.6.

## 2. In scope

| Item | Detail |
|---|---|
| Session baseline | The session-start hook records `sessionId`, the dirty file set, and (lazily, on first stop) the last known check status per touched package at session start |
| Baseline-aware verdict | Each failing check is classified as **caused** (passed at baseline, fails now) or **already failing**. Only caused failures make `failed` and `block`. Already-failing ones print as `Already failing <check>`. Schema gains `failedCause` |
| Baseline cost | When no baseline exists for a package, run the failing check once on a stash of the session's changes (`git stash` with an auto-restore guard), or report "baseline unknown" if that is unsafe (dirty submodules, untracked-only). Never leave the tree modified |
| Session scope | Pass the session-start dirty set as `preExistingChanges` |
| Count fix | Per-package scoped test counts |
| Verdict line | First line: `Prism · proven`, `Prism · unproven (N files)`, `Prism · failed (N checks)` |
| Renderers | `renderReceipt` (text), `renderReceiptMarkdown` (PR comment, shared with `action/render-comment.mjs`), `renderReceiptSvg` (card image) |
| History | `prism receipts` lists the last N with verdict and duration; `prism receipts show <n>` |
| Replay | Rerun `scripts/replay-benchmark.ts` as R2 |

## 3. Out of scope

- ~~The Envelope footer (M-094).~~ Dropped *(Envelope removed 17 Oct 2026)*.
- New check kinds.

## 4. DoD

- [ ] R2: no control case reports `failed` due to a pre-existing failure; catch rate not lower than R0's 5/7 runnable
- [ ] Unit tests: caused vs already-failing, session scoping, count fix, verdict line
- [ ] Tree-safety test: the baseline run restores the working tree byte-for-byte, including untracked files
- [ ] The markdown renderer is used by `action/` (one renderer, two callers)
- [ ] Claude Code kill test: a seeded failing test the agent caused blocks it; a pre-existing failing test does not. Transcript saved
- [ ] `verify:milestone` green
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

`bun run verify:milestone` · `bun scripts/replay-benchmark.ts --out plans/notes/benchmark/R2.json` · kill test transcript in `plans/notes/smoke/M-092.md`.

## 6. Risks

Stash-based baselines touch the user's tree. A guard restores on every exit path, the step is skipped when unsafe, and it is covered by the tree-safety test.
