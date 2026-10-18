# M-087 — Focus Reset Plan

| Field | Value |
|---|---|
| Status | **In Progress** — umbrella branch for M-088 → M-100 and Prism 2.0 |
| Branch | `milestone/M-087-focus-reset-plan` (from `main` at `14ea4cb`) |
| Depends on | — |
| Unlocks | M-088 |
| Packages | none (`plans/` only) |
| Program | [PROGRAM_focus-reset.md](./PROGRAM_focus-reset.md) |
| ADRs | 0060–0066 **Accepted** (0066 since superseded: Envelope removed) |


## Status (17 Oct 2026)

- **Plan part: done.** The owner approved the program on 10 Oct 2026, and ADR-0060 → 0066 are Accepted (`adr/INDEX.md`). The owner then had M-088 → M-100 built on this branch in one pass.
- **What the branch now carries:** checkpoint `2480b92` (M-088 → M-100 work), `f45ccb7` (2.0 deletions), `08e4d3c` (2.0 reliability, ADR-0067), plus uncommitted work since then: next plan P1–P24, rounds 2–3, Envelope removal and the website rebuild. Round 4 is running now (`notes/round4-status.md`).
- **Changed since the plan:**
  - Envelope was removed entirely (17 Oct). The "Prepare + Envelope" hero is now **Prepare + Lens Review**.
  - The hero line is now "Your agent's second pair of eyes."
  - The 2.0 unified plan (`notes/prism-unified-plan.md`) replaced this program's sequencing.
- **Still open:** the owner's review on 18 Oct, then commit and merge. Nothing is pushed or published yet.

## 1. Goal

Lock the Focus Reset on paper: product thesis, owner decisions, cleanup, Prepare + ~~Envelope~~ as hero (Envelope was removed 17 Oct 2026; the hero is now Prepare + Lens Review), Prism Graph, first run, proof, scope cuts, and the M-088 → M-100 sequence. No product code.

## 2. In scope

- `PROGRAM_focus-reset.md`, with the evidence, decisions D1–D6, phases and sequence.
- One-page docs for M-088 → M-100.
- ADR-0060 → ADR-0066 as **Proposed**.
- `PROGRESS.md`: this row In Progress; M-088 → M-100 Planned. On merge, disposition of M-058 → M-063 and M-080 → M-086 per program §12.1.
- `OPEN_QUESTIONS.md`: Q-026 / Q-027 marked reopened by ADR-0060.
- Master Plan §3 banner and §12 rows pointing at this program.
- `plans/milestones/README.md` index rows.

## 3. Out of scope

- Any code, config, plugin, or `$HOME` change, including deleting the published plugin. That is M-089.
- Editing ADR-0057 or PROGRAM_prism-2.0 in place. They are superseded by ADR-0060 → 0064 on acceptance.

## 4. DoD

- [x] Owner approves the program (status → Approved), 2026-10-10
- [x] Owner accepts ADR-0060 → 0066, or names which stay Proposed (all Accepted; 0066 later superseded)
- [x] Hero wording confirmed (program §1.1, Q-7). Since replaced (16–17 Oct) by "Your agent's second pair of eyes."
- [ ] `docs:check` and `check-plan-progress` green
- [ ] Owner approves the commit; merge to local `main`; row → Verified; what-changed snippet shared

## 5. Verification

`bun run docs:check` · `bun run scripts/check-plan-progress.mjs`. A full `verify:milestone` is not meaningful for a docs-only branch while M-078's Node mismatch is open. It is run anyway, and any pre-existing failure is recorded.
