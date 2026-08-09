# M-062 — UI Actionability and IA

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-062-ui-actionability` (from latest `main`) |
| Depends on | M-061 |
| Unlocks | M-063 |
| Packages | `@repo-prism/app-shell`, `@repo-prism/ui`, `apps/playground`, `@repo-prism/vscode-extension` |
| Amends | [ADR-0014](../adr/0014-uxpilot-dark-relock.md) (IA merge); [ADR-0021](../adr/0021-app-shell-consolidation.md) |

## 1. Goal

Every screen earns its place in the nav and every number earns a click target. D-9 is locked: merge
Codebase Profile into DNA Analysis, rename the composite score **Health Score** everywhere, and
make Overview, Blast Radius, and the map feel like one product — not four copies of the same signal
set with dead ends.

## 2. Scope

| ID | Problem | Fix |
|---|---|---|
| **P-D2** | Four screens, one signal set (locked — D-9). | DnaScreen absorbs the Profile content as a section; the separate Profile nav entry is removed; Domains stays the launcher; Overview keeps one summary card; "DNA Score" is renamed "Health Score" everywhere. Screenshots before/after; nav and keyboard flows updated. |
| **P-D1** | DomainScreen monolith. | Split into `src/domains/<Domain>Section.tsx` per domain over the T-12 primitives; DomainScreen.tsx becomes a router under ~400 lines; pixel-identical screenshots. |
| **P-D3** | Overview dead ends. | Domain chips open the domain; region rows focus the map; most-connected rows open blast radius; commit rows link files. |
| **P-D4** | Blast paths not clickable. | Add `onOpenPath` to BlastRadiusScreen; rows become buttons using the Change Review pattern; optional "Reveal on map". |
| **P-D5** | Disabled CTAs (locked: pills). | "Soon" cards become non-interactive status pills linking to docs/roadmap; "Run these tests" routes to the Testing screen; Argo/Jenkins appear only in Integrations. |
| **P-D6** | Map file-zoom not virtualised. | Cap visible cards with lazy expansion; large scopes fall back to the explorer list. |
| **P-D7** | Unbounded lists. | Testing suite tree and blast tests list adopt the PAGE_SIZE=25 "Show more" pattern. |
| **P-D8** | Three table idioms. | One `DataTable` and one `RankList` in `@repo-prism/ui`; migrate `ov-table`, `cr-table`, `dm-rank`, `br-down__row`. |
| **P-D9** | Date formatting inconsistent. | One `formatPrismDate` helper; migrate all renders. |
| **P-D10** | "Sync" means three things. | "Re-index", "Fetch remote git", "Build history" across UI and docs. |
| **P-D11** | Review/Explain invisible. | A Tools nav group in the sidebar including both; playground shows them. |
| **P-D12** | Playground lands on Overview. | Default to `map` after indexing per ADR-0014. |
| **P-D13** | Formula-first tooltips. | Decision-first rewrites; "Focus Areas" becomes "Factors below 70". |
| **P-D14** | Rail labels hidden until hover. | Persistent icon tooltips. |

## 3. Out of scope

| Deferred work | Destination |
|---|---|
| Number-integrity and truncation honesty | M-056 Number Integrity |
| IDE daily-loop hero features | M-057 Daily Loop |
| Website marketing motion | M-055 (Verified) |
| Manager-facing analytics dashboards | Not planned |
| Live Argo/Jenkins connectors | Roadmap pills only |

## 4. Definition of Done

- [ ] M-061 Verified and merged; this branch cut from updated `main`
- [ ] Only one milestone `In Progress`
- [ ] P-D1 through P-D14 implemented (P-D2 IA merge per D-9)
- [ ] Keyboard-only pass over every screen
- [ ] Before/after screenshots for the merged IA and DomainScreen split
- [ ] Pixel-identical domain screens where no IA change applies
- [ ] `bun run verify:milestone` green
- [ ] Owner smoke on all six domain screens
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 5. References

- Prism Completion Program (owner plan, 2026-08-08) — Phase 7; D-9 IA merge locked
- [M-053 Presentation Consolidation](./M-053_presentation-consolidation.md) — T-12 primitives baseline
- [ADR-0014](../adr/0014-uxpilot-dark-relock.md) dark tokens and layout
- [ADR-0021](../adr/0021-app-shell-consolidation.md) app-shell consolidation
