# Start Here

## 0. Where things stand (17 Oct 2026)

- **Product:** Prism, "Your agent's second pair of eyes." Hero features: **Prepare** (the right files, tests, reuse and house style before an agent edits) and **Lens Review** (Dev / Architect / QA lenses after it edits). The receipt closes every change with `SHIP` / `NOT PROVEN` / `NO-SHIP`. Site: `prismhq.in`. npm: `@repo-prism/*`.
- **Gone in 2.0:** Dispatch, the Dashboard, the VS Code / Cursor extensions, the health and report tools, and Envelope (removed 17 Oct). Habits are skills (`~/.prism/skills/<slug>/SKILL.md`).
- **Branch:** all current work is on `milestone/M-087-focus-reset-plan`. The last commit is `08e4d3c`, with a lot of uncommitted work on top. Nothing has been pushed or published.
- **Now:** round 4 of the 2.0 reliability work (`notes/round4-status.md`). It covers the published install path, `prism review --lens`, a lighter prompt hook, medium-repo memory, the follow-up quality gaps, benchmarks B2 / B3 / B5, Claude Code re-tests (Sonnet 5.5 complex, Opus small) and the full release gate.
- **Next:** the owner reviews on 18 Oct. Then commit, the 2.0.0 release ([`RELEASE_RUNBOOK.md`](./RELEASE_RUNBOOK.md)) and the website deploy, each only on the owner's word. Only 2.0.0 is released, once.
- **Read first:** [`PROGRESS.md`](./PROGRESS.md) (status of every milestone), [`notes/prism-2-next-change-report.md`](./notes/prism-2-next-change-report.md) (results, rounds 2–4), [`notes/prism-unified-plan.md`](./notes/prism-unified-plan.md) (the 2.0 contract, ADR-0067).
- **Dev rules for this phase:** every Prism install points at the local build. Use Node 24 (`.nvmrc` 24.18.1) and bun. Do not commit, push, publish or deploy without asking.

The sections below are the original start-up steps (M-000, M-001). The hard rules in §7 still apply.

## Original start-up steps (history)

## 1. First milestone (docs — not code)

**M-000 — Architecture Documentation**  
Doc: [`archive/milestones/M-000_architecture-documentation.md`](./archive/milestones/M-000_architecture-documentation.md)

Produces HLD, LLD, tech-stack, folder structure, data flows, and package responsibilities under `plans/architecture/`.

Do **not** start M-000 until the owner marks  
`plans/00_MASTER_DEVELOPMENT_PLAN.md` as **APPROVED**.

Do **not** start **M-001** until M-000 is **Verified**.

## 2. Then: first code milestone

**M-001 — Project Foundation & Monorepo**  
Doc: [`archive/milestones/M-001_project-foundation.md`](./archive/milestones/M-001_project-foundation.md)

## 3. Git commands (local only)

```bash
# After Master Plan approval — docs branch first
git checkout main
git checkout -b milestone/M-000-architecture-docs

# … write plans/architecture/* only …

# After owner approval — merge LOCAL ONLY
git checkout main
git merge --no-ff milestone/M-000-architecture-docs
# Update plans/PROGRESS.md → M-000 Verified

# First implementation branch FROM updated main
git checkout -b milestone/M-001-project-foundation

# … implement M-001 only …
bun run verify:milestone

git checkout main
git merge --no-ff milestone/M-001-project-foundation
git checkout -b milestone/M-002-shared-contracts
```

**Never** develop on `main`. **Never** stack milestone branches. **Never commit until the owner approves.** **Never** push unless the owner explicitly asks.

## 4. Definition of Done

- **M-000:** see checklist in `archive/milestones/M-000_architecture-documentation.md` (docs review; no Bun verify yet)
- **M-001:** see checklist in `archive/milestones/M-001_project-foundation.md` + `bun run verify:milestone`

## 5. Verification checklist (every code milestone, M-001+)

- [ ] Typecheck
- [ ] Lint
- [ ] Unit tests
- [ ] Integration tests (when applicable)
- [ ] Build
- [ ] Performance checks (when applicable)
- [ ] Manual verification checklist in milestone doc
- [ ] Documentation / PROGRESS updated
- [ ] `bun run verify:milestone` passed

## 6. Owner approval checklist (every milestone)

- [ ] Scope matches milestone doc (no silent expansions)
- [ ] Hard Rules followed (branch, no commit before approval, no push, no stack)
- [ ] Verify suite green **or** M-000 docs checklist complete
- [ ] Main will remain buildable after merge (N/A for docs-only M-000; still merge cleanly)
- [ ] Explicit owner approval to **commit**, then to **merge**
- [ ] PROGRESS status → Verified after merge

## 7. Hard Rules (verbatim)

- Never implement product code before the Master Plan is approved **and M-000 is Verified**.
- **Never create git commits until the owner explicitly approves** (keep work uncommitted until then).
- One active milestone at a time.
- One milestone = one Git branch.
- Never develop on main.
- Never stack milestone branches.
- Never merge without owner approval.
- Never push unless owner explicitly asks.
- Every code milestone must pass the complete verification suite.
- Every merge to main must leave the repository buildable (after M-001+).
- Every milestone must update the Master Plan progress.
