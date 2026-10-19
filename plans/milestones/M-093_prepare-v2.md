# M-093 — Prepare v2

| Field | Value |
|---|---|
| Status | **Built, not verified** — B2 eval and lighter prompt hook open (round 4) |
| Branch | `milestone/M-093-prepare-v2` (from latest `main`) |
| Depends on | M-092 Verified |
| Unlocks | ~~M-094~~ M-095 (M-094 obsolete) |
| Packages | `intelligence` (prepare), `core` (`prepareChange`), `mcp-server` (`tools/prepare.ts`), `plugin` (prompt-submit hook), `scripts/bench` (replay eval) |
| ADR | [ADR-0065](../adr/0065-auto-prepare.md) |


## Status (17 Oct 2026)

- **Built:**
  - Signature-only packs (next plan P2).
  - A token cap per tool (P3) and no repeats within a session (P4).
  - Co-change ranking and learning from real edits (P6/P7).
  - Reasons and confidence on each pick (P9).
  - Auto-Prepare on prompt submit (ADR-0065). In round 3 the lens goes out first.
- **B4 golden, round 3:** top-3 39.1% and recall@pack 61.8%. Both are up from 2.0 but below the targets of ≥ 55% and ≥ 70%.
- **Round 4 (running):**
  - B2 Prepare eval, skipped since round 2.
  - A lighter prompt hook. Round 3 made it start a second Node process, and its 1 s tests are flaky on the 8 GB Mac. A fix is made but not yet gated.

## 1. Goal

Every change starts with a small, correct pack, injected without the agent asking. Quality is measured on real history. Program §5.

## 2. In scope

| Item | Detail |
|---|---|
| Whole-response budget | Default 2,000 tokens, ceiling 6,000, trim order per program §5.1, `truncated` block. Contract test over fixtures |
| Replay eval | `scripts/bench/prepare-eval.ts`: about 200 commits from this repo, es-toolkit, zod, hono (+1–2 TS monorepos, Q-6). Metrics: recall@pack, precision@pack, tokens, reuse hit rate. Frozen set in `plans/notes/prepare-eval/set.json`; results `E<n>.json` + `.md` |
| Baseline run | E0 on the current Prepare before any ranking change |
| Prompt-submit hook | Claude Code `UserPromptSubmit`; Cursor `beforeSubmitPrompt` if available, otherwise recorded as a gap. Deterministic change-request detection; compact Prepare (about 800 tokens) as additional context; never blocks; `PRISM_AUTOPREPARE=0` |
| Latency | Before M-095, in-process with a 300 ms budget, skipped when over budget. Skips logged in `hook-log` |
| Before-edit line | "Not in Prism's pack; check `blast_radius`" when the edited file is outside the last pack |
| Ranking | Co-change signal, nearest-test inclusion, `rationale_for` notes. Each merged only if eval recall@pack does not drop more than 1 point |

## 3. Out of scope

- ~~Envelope session grouping (M-094).~~ The daemon (M-095).

## 4. DoD

- [ ] p50 ≤ 2k tokens, p95 ≤ 6k on the eval set (measured from the response bytes)
- [ ] E0 and the final E<n> published; recall@pack final ≥ E0 − 1 point. Gains reported as measured, no target invented
- [ ] Prompt-submit hook works in Claude Code; Cursor parity or a recorded gap
- [ ] Detection unit tests: change prompts trigger, questions do not ("what does X do", "explain")
- [ ] Claude Code smoke: a change prompt gets the pack injected, and the transcript shows the agent opening pack files first
- [ ] `verify:milestone` green
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

`bun run verify:milestone` · `bun scripts/bench/prepare-eval.ts` · smoke transcript `plans/notes/smoke/M-093.md`.
