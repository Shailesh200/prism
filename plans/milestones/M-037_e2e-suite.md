# M-037 — End-to-End Test Suite

| Field | Value |
|---|---|
| Status | **Not Started** |
| Branch | `milestone/M-037-e2e-suite` (from latest `main`) |
| Depends on | M-027, M-029, M-052 |
| Unlocks | M-038, M-039 |
| Packages | repo-wide |
| Source | Test infrastructure audit 2026-08-05 |

## 1. Goal

Give Prism a test layer that exercises **whole paths** — repository on disk through Core to a
surface — rather than units in isolation. The unit layer is genuinely healthy; what is missing is
any test that would catch a break *between* the pieces.

## 2. Current state (audit 2026-08-05)

| Measure | Value |
|---|---|
| Unit test files | 105 |
| Integration test files | **4** |
| Packages with an integration config but zero integration tests | **15 of 17** |
| Vitest snapshot files | 0 |
| Committed golden JSON files | 6 |
| Browser/e2e tooling installed | **None** — no Playwright, Puppeteer or Cypress |
| VS Code test harness | **None** — no `@vscode/test-electron` or `@vscode/test-cli` |
| CI OS matrix | `ubuntu-latest` only |

Every one of the 17 integration configs sets `passWithNoTests: true`, so `bun run test:integration`
reports success while running almost nothing. The moon output showing "No test files found, exiting
with code 0" across fifteen packages is the honest version of that.

**Core SDK coverage gap.** Eighteen `PrismWorkspace` methods appear only in the API-surface
inventory lock, never in a behavioural test: `startWatch`, `stopWatch`, `notifyWatchPaths`,
`getIndexFreshness`, `saveBookmark`, `removeBookmark`, `listBookmarks`, `setConsent`, `getConsent`,
`reviewChanges`, `explainArea`, `getTestingReport`, `getSecurityReport`,
`ingestCoverageFromWorkspace`, `getGitActivity`, `getUtilityJob`, `listUtilityJobs`,
`getIngestArtifact`, `discoverFrontendRoutes`. Four top-level exports likewise: `createWorkspace`,
`stageDevopsRemote`, `listLocalWorkspaceTests`, `runLocalWorkspaceTests`.

M-051 Phase 1 covers watch, bookmarks and navigation. M-036 covers consent. This milestone covers
the rest and the layer above them.

## 3. What "end to end" means here

Four levels, and only the last two are new.

| Level | Scope | Status |
|---|---|---|
| Unit | One module | Healthy — 105 files |
| Integration | One package against a real fixture on disk | Nearly absent — this milestone |
| Surface | Core through MCP / CLI / extension host | Absent — this milestone |
| UI | Rendered app in a browser | Absent — this milestone, playground only |

## 4. Scope — phases

### Phase 1 — Fixture strategy

| Task | Detail |
|---|---|
| 1.1 | Promote fixtures to a shared, documented set. Thirteen useful fixtures exist under `packages/intelligence/fixtures/` with milestone-based names that say nothing about their content |
| 1.2 | Add the fixtures the audit found missing: a repository **with real git history** (all current fixtures are git-less), and one large enough to exercise truncation |
| 1.3 | `fixtures/README.md` describing each fixture: shape, what it is for, what must stay stable |
| 1.4 | A helper for materialising a fixture into a temp directory with a real `.git`, so git-dependent paths are testable at all |

### Phase 2 — Package integration tests

Fill in the fifteen empty integration configs. One meaningful test per package minimum — a package
whose integration config stays empty must have `passWithNoTests` removed instead, so the emptiness
is visible.

| Task | Detail |
|---|---|
| 2.1 | `@prism/core` — the largest gap. Cover the 18 untested workspace methods against real fixtures |
| 2.2 | `@prism/intelligence` — 26 unit tests, zero integration. Report builders against fixture repositories end to end |
| 2.3 | `@prism/impact`, `@prism/navigation`, `@prism/repository-map`, `@prism/graph-engine` — real-fixture paths |
| 2.4 | `@prism/shared` — schema round-trips against real DTOs produced by Core, not hand-written objects |
| 2.5 | Remove `passWithNoTests: true` everywhere it is no longer needed |

### Phase 3 — Surface tests

| Task | Detail |
|---|---|
| 3.1 | **MCP**: in-process client, full handshake, every tool called against a fixture, outputs schema-validated (extends M-026/M-027 contract tests into a suite) |
| 3.2 | **CLI**: spawn the real binary; assert stdout, stderr and exit code separately; `--json` parses; `--fail-on` exits correctly |
| 3.3 | **Extension host**: `host-dispatch` driven directly with protocol messages, asserting Core is reached and responses validate. This does not need a real VS Code instance |
| 3.4 | **Cross-surface agreement**: the same question asked via Core, MCP and CLI returns the same answer. This is the test that would have caught the drift M-052 exists to fix |

### Phase 4 — UI tests (playground only)

| Task | Detail |
|---|---|
| 4.1 | Add Playwright. Playground only — a real VS Code Electron harness is disproportionate here |
| 4.2 | Smoke every screen: Overview, Map, DNA, Domains, Blast, Trends, Testing & Security, Settings — loads, renders, no console error |
| 4.3 | Two or three journeys, not exhaustive coverage: open a repo → view map → select a node → see blast radius |
| 4.4 | Assert the M-051 provenance states render: a git-less fixture shows explicit no-data, never fabricated colour |
| 4.5 | Screenshot baselines for the six domain screens, giving M-052's "no visual change" claim something to check against |

### Phase 5 — CI

| Task | Detail |
|---|---|
| 5.1 | Add `macos-latest` and `windows-latest` to the verify matrix. Windows path handling has never been tested (Q-011 deferred this in M-005) |
| 5.2 | Separate CI jobs for unit, integration, surface and UI so a failure names its own layer |
| 5.3 | Keep total CI time reasonable: UI tests on `main` and pull requests only, not every branch push |
| 5.4 | Publish coverage as a trend, not a gate — a coverage threshold would encourage exactly the wrong tests here |

## 5. Out of scope

- A real VS Code Electron harness (`@vscode/test-electron`) — Phase 3.3 gets the value more cheaply
- Load and performance testing (M-035 owns benchmarks)
- Mutation testing
- 100% coverage as a target
- Testing the Cursor packaging overlay separately — same code, per [ADR-0020](../adr/0020-cursor-packaging-overlay.md)

## 6. Definition of Done

- [ ] Only one milestone `In Progress`
- [ ] Fixture set documented; a git-bearing fixture exists
- [ ] No package retains `passWithNoTests: true` while having no tests — the emptiness is either fixed or visible
- [ ] All 18 untested Core workspace methods have behavioural coverage
- [ ] MCP, CLI and extension-host surface suites pass
- [ ] Cross-surface agreement test passes for at least four questions
- [ ] Playwright smoke over every playground screen
- [ ] Screenshot baselines committed for the six domain screens
- [ ] CI matrix covers Linux, macOS and Windows
- [ ] `bun run verify:milestone --force` green on all three platforms
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 7. Verification plan

| Kind | Check |
|---|---|
| Meta | A script asserts every package with an integration config has at least one integration test, or no config |
| Integration | Each of the 18 previously untested Core methods exercised against a fixture |
| Surface | Every MCP tool and every CLI command against the same fixture |
| Cross-surface | Core, MCP and CLI agree on blast radius, health, DNA and dependency cycles for identical inputs |
| UI | Playwright smoke on all screens; zero console errors |
| UI | Git-less fixture renders no-data states, not colour |
| Platform | Full suite green on ubuntu, macos and windows runners |
| Regression | All 6 existing goldens unchanged |

## 8. Risks

| Risk | Mitigation |
|---|---|
| CI time balloons and stops being run | Layered jobs, UI restricted to `main` and PRs, fixtures generated rather than committed where large |
| Windows reveals a backlog of path bugs | Likely, and worth knowing. Windows job is advisory for one milestone, then blocking |
| Screenshot baselines are flaky across platforms | Baselines captured on Linux CI only; fonts pinned; generous diff threshold |
| Tests written against current behaviour cement current bugs | Phase order matters: M-051 and M-036 land their fixes first, so this milestone tests corrected behaviour |
| Playwright adds a heavy dependency | Playground only, dev-dependency only, not shipped in any published artifact |

## 9. References

- Test audit 2026-08-05 · [M-051](./M-051_hardening.md) Phase 1 · [M-036](./M-036_security-privacy.md) Phase 3 ·
  [M-052](./M-052_surface-consolidation.md) Phase 1 · Q-011 in [`OPEN_QUESTIONS.md`](../OPEN_QUESTIONS.md)
