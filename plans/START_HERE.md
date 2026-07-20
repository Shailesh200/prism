# Start Here — After Master Plan Approval

## 1. First milestone (docs — not code)

**M-000 — Architecture Documentation**  
Doc: [`milestones/M-000_architecture-documentation.md`](./milestones/M-000_architecture-documentation.md)

Produces HLD, LLD, tech-stack, folder structure, data flows, and package responsibilities under `plans/architecture/`.

Do **not** start M-000 until the owner marks  
`plans/00_MASTER_DEVELOPMENT_PLAN.md` as **APPROVED**.

Do **not** start **M-001** until M-000 is **Verified**.

## 2. Then: first code milestone

**M-001 — Project Foundation & Monorepo**  
Doc: [`milestones/M-001_project-foundation.md`](./milestones/M-001_project-foundation.md)

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

- **M-000:** see checklist in `milestones/M-000_architecture-documentation.md` (docs review; no Bun verify yet)
- **M-001:** see checklist in `milestones/M-001_project-foundation.md` + `bun run verify:milestone`

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
