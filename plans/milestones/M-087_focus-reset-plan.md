# M-087 — Focus Reset Plan

| Field | Value |
|---|---|
| Status | **In Progress** (docs only) |
| Branch | `milestone/M-087-focus-reset-plan` (from `main` at `14ea4cb`) |
| Depends on | — |
| Unlocks | M-088 |
| Packages | none (`plans/` only) |
| Program | [PROGRAM_focus-reset.md](./PROGRAM_focus-reset.md) |
| ADRs | 0060–0066 drafted as **Proposed** |

## 1. Goal

Lock the Focus Reset on paper: product thesis, owner decisions, cleanup, Prepare + Envelope as hero, Prism Graph, first run, proof, scope cuts, and the M-088 → M-100 sequence. No product code.

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

- [ ] Owner approves the program (status → Approved)
- [ ] Owner accepts ADR-0060 → 0066, or names which stay Proposed
- [ ] Hero wording confirmed (program §1.1, Q-7)
- [ ] `docs:check` and `check-plan-progress` green
- [ ] Owner approves the commit; merge to local `main`; row → Verified; what-changed snippet shared

## 5. Verification

`bun run docs:check` · `bun run scripts/check-plan-progress.mjs`. A full `verify:milestone` is not meaningful for a docs-only branch while M-078's Node mismatch is open. It is run anyway, and any pre-existing failure is recorded.
