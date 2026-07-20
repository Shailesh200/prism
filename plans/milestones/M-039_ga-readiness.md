# M-039 — GA Readiness

| Field | Value |
|---|---|
| Branch | `milestone/M-039-ga-readiness` |
| Status | Not Started |
| Depends on | M-036, M-038 |
| Unlocks | GA tag / release |
| Packages | repo-wide |

## Goal

Cross the bar for a **production-grade open-source GA**: release checklist, versioning, security pass, docs complete, known limitations published, and repository left buildable with tagged release process (local; push only if owner asks).

## In Scope

- GA checklist completion (functionality, quality, docs, legal)
- Version bump to `1.0.0` (or owner-chosen)
- CHANGELOG finalization
- SECURITY.md / CONTRIBUTING.md final review
- Performance budgets attested
- “Known limitations” page
- Sample repos & demos verified end-to-end

## Out of Scope

- Post-GA cloud features
- Marketing website beyond docs

## Definition of Done

- [ ] All critical-path milestones Verified
- [ ] `bun run verify:milestone` green on main
- [ ] GA checklist signed by owner
- [ ] Release notes drafted
- [ ] PROGRESS shows M-039 Verified
- [ ] Owner approval to tag release

## GA Checklist (summary)

- [ ] Core SDK stable
- [ ] MCP tools pack usable in Cursor
- [ ] CLI usable in scripts
- [ ] VS Code + Cursor extensions installable
- [ ] Map hero feature demoable
- [ ] Privacy defaults verified (no network)
- [ ] License headers / LICENSE present
- [ ] Docs site build green

## Verification

Full suite · E2E · Manual GA script · Docs · Security checklist
