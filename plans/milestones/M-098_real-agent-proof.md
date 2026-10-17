# M-098 — Proof with Claude Code

| Field | Value |
|---|---|
| Status | **Open** — round 4 re-tests and release gate pending |
| Branch | `milestone/M-098-real-agent-proof` (from latest `main`) |
| Depends on | M-097 Verified |
| Unlocks | M-099 |
| Packages | `scripts/bench` (A/B harness), ~~`envelope` (calibration table)~~, `apps/website` (`/benchmarks`) |
| Absorbs | M-063 proof half |


## Status (17 Oct 2026)

- **Done:**
  - The A/B harness (`scripts/bench/agent-ab.ts`, `ab-quality.ts`).
  - B6 runs on Claude Code and opencode in rounds 1–3 (`notes/benchmark-real-agents-*.md`).
  - The published proof page (`docs/benchmarks/2.x.md`, website `/benchmarks`).
  - The release gate (`scripts/bench/release-gate.mjs`), which `publish-npm` runs.
- **Round 3:** the gate fails 1 check, Claude cost on small tasks (--.168 → --.185 median), which was not re-measured. B1 passes at 0.92, but only because of a counting fix.
- **Losses:**
  - On follow-ups, Prism's code was graded less minimal (3.89 vs 4.44), with 2% more tokens.
  - With opencode, correctness was lower (4.27 vs 4.64).
- **Round 4 (running):**
  - Claude Code re-tests: Sonnet 5.5 for complex tasks, Opus for small tasks.
  - The follow-up quality gaps.
  - A full release gate run.
- **Dropped:** "calibrates Envelope". Envelope was removed on 17 Oct 2026.

## 1. Goal

Measure Claude Code with and without Prism on real tasks, publish whatever it shows. ~~Calibrate Envelope's "estimated saved".~~ *(Envelope removed 17 Oct 2026)*. Program §9. Owner decision D3: Claude Code, with the owner's account.

## 2. In scope

| Item | Detail |
|---|---|
| Task set | 30–40 past commits with a test failing before and passing after, from es-toolkit, zod, hono, 1–2 more TS repos, and this repo's fixtures. Frozen in `plans/notes/benchmark-real-agents/tasks.json` |
| Harness | `scripts/bench/agent-ab.ts`: fresh checkout at parent, arm A (no Prism config) or B (dev pack), `claude -p` headless with JSON output, fixed model and time limit, randomised order, ≥ 3 runs per task per arm |
| Cost gate | Before running: estimated tokens and cost per arm printed; the owner approves; a hard stop at the approved budget |
| Metrics | Success (hidden test plus full suite), broken builds at "done", input / output tokens, wall time, files opened, tool calls, Prism share of context |
| Analysis | Means, 95% CIs (bootstrap), per-task table, raw JSONL |
| Publish | `plans/notes/benchmark-real-agents.md`; website `/benchmarks` replaces the simulated numbers |
| ~~Calibration~~ | Dropped *(Envelope removed 17 Oct 2026)* |

## 3. Out of scope

- Other agents (Cursor, Codex) unless the owner asks later. Marketing copy (M-100).

## 4. DoD

- [ ] The owner approved the cost estimate before the run
- [ ] All runs complete or are recorded as failed with a reason
- [ ] Report published with CIs and raw data, including negative or flat results
- ~~Envelope "estimated saved" shows calibrated values~~ (dropped *(Envelope removed 17 Oct 2026)*)
- [ ] `verify:milestone` green
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

Rerunning one task per arm reproduces within the CI. `bun run verify:milestone`.

## 6. Risks

Small or noisy effect: report it honestly and feed the per-task losses into Prepare and Graph. The hero copy is revisited before M-100 if "faster" or "fewer broken builds" is not supported.
