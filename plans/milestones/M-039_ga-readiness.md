# M-039 — GA Readiness

| Field | Value |
|---|---|
| Status | **Not Started** |
| Branch | `milestone/M-039-ga-readiness` (from latest `main`) |
| Depends on | M-036, M-037, M-038 |
| Unlocks | GA release |
| Packages | repo-wide |
| Owner decision | 2026-08-05 — full GA including publish, **but** the final push is left to the owner |

> **Rewritten 2026-08-05.** The original predates the surfaces, the marketplace listing and the
> hardening milestones.

## 1. Goal

Take Prism from "works on the author's machine" to "a stranger can install it, trust it, and get
value in five minutes" — and leave the release itself as a single deliberate human action.

## 2. Release boundary (owner decision)

Everything is prepared: version bumped, CHANGELOG written, tag created locally, release notes
drafted, publish workflow verified. **The tag is not pushed.** Publishing to VS Marketplace and
Open VSX is irreversible and happens only after the owner has smoked the build:

```bash
git push origin repo-prism-v1.0.0   # owner runs this, and only this, to release
```

This is consistent with `AGENTS.md` — never push unless the owner explicitly asks — and with
M-051 Phase 0, which made publishing tag-triggered precisely so that releasing is an explicit act.

## 3. Scope — phases

### Phase 1 — Audit against reality

| Task | Detail |
|---|---|
| 1.1 | Every milestone in `PROGRESS.md` genuinely Verified with DoD boxes checked (M-051 Phase 4.6 makes this machine-checkable) |
| 1.2 | Every ADR either Accepted or explicitly Superseded — no ADR left Proposed |
| 1.3 | `OPEN_QUESTIONS.md`: every question resolved or explicitly deferred post-GA with a reason |
| 1.4 | Deferred milestones (M-024, M-033, M-034) recorded as deliberate, not forgotten |
| 1.5 | Master Plan and PRD reflect what was actually built — including `architecture_rules`, which M-027 removed as never having existed |

### Phase 2 — Product completeness

| Task | Detail |
|---|---|
| 2.1 | Fresh-clone install works from the README alone on macOS and Linux |
| 2.2 | Every surface installable and functional: VS Code, Cursor, CLI, MCP, playground |
| 2.3 | First-run experience on a repository Prism has never seen — no crash, no empty screen without explanation |
| 2.4 | Every error path produces a message a user can act on |
| 2.5 | Known limitations documented honestly: TypeScript/JavaScript only, heuristic feature inference, no cross-language resolution, git-dependent signals absent without history |

### Phase 3 — Release engineering

| Task | Detail |
|---|---|
| 3.1 | Version `1.0.0` across the extension, Core SDK and CLI, with the relationship between them documented |
| 3.2 | `CHANGELOG.md` covering the whole arc, written for users rather than as a commit log |
| 3.3 | Release notes for the marketplace listing |
| 3.4 | Publish workflow dry-run: build all five platform VSIXs, verify the tag/version guard from M-051 Phase 0, stop before publishing |
| 3.5 | npm packaging for `@prism/core`, `@prism/cli` and `@prism/mcp-server` prepared but unpublished — resolve Q-003 (`@prism` scope availability) first |
| 3.6 | `LICENSE` present and license headers consistent (MIT, Q-001) |
| 3.7 | Tag `repo-prism-v1.0.0` created locally, **not pushed** |

### Phase 4 — Final verification

| Task | Detail |
|---|---|
| 4.1 | `bun run verify:milestone --force` green on Linux, macOS and Windows |
| 4.2 | Full E2E suite green (M-037) |
| 4.3 | No-network attestation green (M-036) |
| 4.4 | Performance budgets met (M-035) |
| 4.5 | Docs site builds; every link resolves (M-038) |
| 4.6 | Install each platform VSIX and smoke it |
| 4.7 | GA checklist signed by the owner |

## 4. GA checklist

- [ ] Core SDK stable at v1; breaking-change policy documented
- [ ] MCP tools usable from Cursor in a real agent session
- [ ] CLI usable in a CI script, with `--fail-on` exit codes
- [ ] VS Code and Cursor extensions install from a local VSIX
- [ ] Map demoable on an unfamiliar repository
- [ ] Privacy verified: no network in Core analysis, proven by test
- [ ] No telemetry (Q-010), no cloud (Q-009)
- [ ] LICENSE, SECURITY.md, CONTRIBUTING.md, PRIVACY.md present
- [ ] Docs site builds and is complete
- [ ] Known limitations published
- [ ] Performance budgets attested
- [ ] CHANGELOG and release notes final

## 5. Out of scope

- Actually pushing the tag — owner action
- npm publication (prepared, gated on Q-003)
- Marketing, launch, community infrastructure
- Post-GA roadmap
- Any new feature. If it is not built by now, it is v1.1

## 6. Definition of Done

- [ ] Only one milestone `In Progress`
- [ ] Phases 1–4 complete
- [ ] GA checklist fully ticked with evidence
- [ ] `1.0.0` across all published artifacts
- [ ] Tag created locally and **not** pushed
- [ ] Release runbook written: what the owner runs, what happens, how to roll back
- [ ] `bun run verify:milestone --force` green on three platforms
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 7. Verification plan

| Kind | Check |
|---|---|
| Full suite | Unit, integration, surface, UI, no-network, budgets — all green on three platforms |
| Fresh clone | Clone to a clean directory, follow the README, reach a working analysis |
| Install | Each of the five platform VSIXs installs and opens |
| Release | Workflow dry-run produces all five artifacts; version guard rejects a mismatched tag |
| Docs | Site builds; quickstart followed literally on a clean machine |
| Manual | Owner smoke against the GA checklist |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Phase 1 reveals a milestone that is not actually done | Better now than after release. Fix or downgrade and adjust the GA bar |
| Windows fails late | M-037 Phase 5 surfaces it a milestone earlier, deliberately |
| 1.0.0 implies stability the Core SDK cannot hold | Breaking-change policy documented alongside the version ([ADR-0019](../adr/0019-core-sdk-versioning.md)) |
| Publishing cannot be undone | Precisely why the tag push is the owner's, after smoking |
| `@prism` npm scope is taken (Q-003) | npm publishing is prepared but not required for GA; the extension is the primary artifact |

## 9. References

- [ADR-0019](../adr/0019-core-sdk-versioning.md) · [ADR-0025](../adr/0025-marketplace-packaging.md) ·
  [M-051](./M-051_hardening.md) Phase 0 · Q-001, Q-003, Q-009, Q-010 in [`OPEN_QUESTIONS.md`](../OPEN_QUESTIONS.md)
