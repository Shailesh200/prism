# M-092 — Receipt v2

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-092-receipt-v2` (from latest `main`) |
| Depends on | M-091 Verified |
| Unlocks | M-093 |
| Packages | `mcp-server/src/safety` (`receipt.ts`, `hook-command.ts`, `snapshot.ts`), `plugin/hooks/prism-hook.mjs`, `shared/src/receipt.ts`, `checks`, `cli` (`prism receipts`), `action/render-comment.mjs` |
| ADR | none new (ADR-0058 §2 stands) |

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

- The Envelope footer (M-094).
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
