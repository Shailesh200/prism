# Prism — Open Questions

Resolve these with the owner before or during the indicated milestone. Record answers via ADR when architectural.

| ID | Question | Needed by | Default if unanswered |
|---|---|---|---|
| Q-001 | License: MIT vs Apache-2.0 vs other? | M-001 | **Resolved: MIT** (`LICENSE`) |
| Q-002 | Cache location: `.prism/` in workspace vs XDG cache dir? | M-008 | **Resolved:** `<workspace>/.prism/cache/index.sqlite` ([ADR-0010](./adr/0010-sqlite-cache-location.md)) |
| Q-003 | Publish scope: GitHub org name / npm scope `@prism` availability? | M-001 / GA | **Resolved:** `@prism` org/scope unavailable; publish under npm org **`repo-prism`** as `@repo-prism/*` |
| Q-004 | Cursor extension: separate VSIX vs single VS Code extension? | M-032 | **Resolved:** single implementation + Cursor packaging overlay ([ADR-0020](./adr/0020-cursor-packaging-overlay.md)) |
| Q-005 | First non-TS language after GA path: Python or Go? | M-034 | **Open** — M-034 deferred post-GA (owner, 2026-08-05); decide when the milestone is revived |
| Q-006 | Hash algorithm: BLAKE3 (native) vs SHA-256 (pure)? | M-005 | **Resolved: SHA-256** ([ADR-0006](./adr/0006-content-hash-sha256.md)) |
| Q-007 | Map library: React Flow vs custom Canvas? | M-018 | **Resolved: React Flow** (`@xyflow/react`, shipped in `@repo-prism/ui` since M-018). Custom canvas was not attempted; nothing since has argued for it |
| Q-008 | Docs framework: VitePress vs Astro? | M-038 | **Resolved: VitePress** (owner, 2026-08-05); plain Markdown `/docs` is the source, the site renders it |
| Q-009 | Will Prism ever offer optional cloud sync? | Post-GA | **Resolved: no cloud sync** (owner, 2026-08-05); architecture stays local-first |
| Q-010 | Telemetry: entirely absent vs opt-in anonymous? | M-036 | **Resolved: entirely absent** (owner, 2026-08-05); M-036 Phase 3 proves it by test |
| Q-011 | Support Windows symlink / case-insensitive paths explicitly in M-005? | M-005 | **Deferred past GA (M-039):** Windows now runs in CI as an advisory job (M-037 Phase 5), so the evidence accumulates without blocking. GA ships macOS and Linux as supported; Windows is untested and documented as such |
| Q-012 | Branding: keep product name **Prism** publicly (vs RepoPulse)? | Plan approval | **Resolved: Prism.** The marketplace listing is *RepoPrism* because *Prism* was taken there ([ADR-0025](./adr/0025-marketplace-packaging.md)) |
| Q-013 | Lint/format | M-001 | **Resolved: Oxlint + Oxfmt** (ADR-0003) |
| Q-014 | moon `pre-push` full verify vs CI-only? | M-001 | **Resolved as built:** pre-commit runs lint and format; `verify:milestone` runs in CI and locally before review. Benchmarks and the browser suite are separate jobs, so a slow check never makes the fast one skippable |
| Q-015 | Add optional deep-TS mode (ts-morph) if Oxc refs weak? | M-011+ | **Deferred** — Oxc v1 default; deep TS optional ([ADR-0009](./adr/0009-oxc-parser-v1-deep-ts-optional.md)) |
| Q-016 | Stack/persona taxonomy: freeze enum vs open string registry? | M-040 | **Resolved: open string registry** with documented well-known ids ([ADR-0007](./adr/0007-stack-detector-spi.md)). Shipped that way; M-037 tightened signal identity to id + domain so an open registry cannot produce duplicate rows |
| Q-017 | Lighthouse / web perf: ingest-only vs local runner vs cloud? | M-041 | **Resolved: Option B** — opt-in local runner + async PORT callout; SEO/CWV expansions on backlog ([ADR-0008](./adr/0008-stack-aware-measurement-utilities.md)) |
| Q-018 | CWV attribution depth (route vs chunk vs component)? | M-041 | **Resolved: Option C** — rollups + drill to component when attributable; not LCP-only ([ADR-0008](./adr/0008-stack-aware-measurement-utilities.md)) |
| Q-019 | Stack utilities vs Map UI sequencing? | M-041 / M-018 | **Resolved: Option C** — M-041 Gate A (P0+P1+Mono-v1) **before** M-018; remaining packs continue in parallel ([ADR-0008](./adr/0008-stack-aware-measurement-utilities.md)) |
| Q-020 | Privacy for perf utilities / PageSpeed / cloud? | M-041 / M-036 | **Resolved:** reports local only; remote probes consent-only; **no Prism Cloud** ([ADR-0008](./adr/0008-stack-aware-measurement-utilities.md)) |
| Q-021 | Multi-domain monorepo: single stack winner vs per-package? | M-041 / M-013 | **Resolved:** per-package profiles + workspace rollup; package-scoped utilities; additive domains ([ADR-0008](./adr/0008-stack-aware-measurement-utilities.md) D5) |
| Q-022 | Soft blast signals: do medium-confidence config/CI hits **block** Safe Delete, or only warn? | M-049 | **Decided (ADR-0027):** medium+ blocks; low = warn only |
| Q-023 | Blast vs Change Review risk band thresholds (60/20 vs 70/35) — unify to which? | M-049 | **Decided (ADR-0027):** unify to Blast **60/20** (High ≥60, Mid ≥20) everywhere. **Enforced in code M-051:** single `riskToBand` / `riskBandDescriptor` in `@repo-prism/shared`; the duplicated per-screen thresholds are gone |

Update this file when questions are decided; link ADRs.
