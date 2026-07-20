# Prism — Open Questions

Resolve these with the owner before or during the indicated milestone. Record answers via ADR when architectural.

| ID | Question | Needed by | Default if unanswered |
|---|---|---|---|
| Q-001 | License: MIT vs Apache-2.0 vs other? | M-001 | **Resolved: MIT** (`LICENSE`) |
| Q-002 | Cache location: `.prism/` in workspace vs XDG cache dir? | M-008 | `.prism/cache` in workspace + gitignore |
| Q-003 | Publish scope: GitHub org name / npm scope `@prism` availability? | M-001 / GA | Keep `@prism` locally; rename if taken |
| Q-004 | Cursor extension: separate VSIX vs single VS Code extension? | M-032 | Single extension + Cursor packaging overlay |
| Q-005 | First non-TS language after GA path: Python or Go? | M-034 | Python |
| Q-006 | Hash algorithm: BLAKE3 (native) vs SHA-256 (pure)? | M-005 | **Resolved: SHA-256** ([ADR-0006](./adr/0006-content-hash-sha256.md)) |
| Q-007 | Map library: React Flow vs custom Canvas? | M-018 | React Flow |
| Q-008 | Docs framework: VitePress vs Astro? | M-038 | VitePress |
| Q-009 | Will Prism ever offer optional cloud sync? | Post-GA | Not in GA; keep architecture local-first |
| Q-010 | Telemetry: entirely absent vs opt-in anonymous? | M-036 | Entirely absent for GA |
| Q-011 | Support Windows symlink / case-insensitive paths explicitly in M-005? | M-005 | Yes, test on CI later; document quirks |
| Q-012 | Branding: keep product name **Prism** publicly (vs RepoPulse)? | Plan approval | **Prism** |
| Q-013 | Lint/format | M-001 | **Resolved: Oxlint + Oxfmt** (ADR-0003) |
| Q-014 | moon `pre-push` full verify vs CI-only? | M-001 | Prefer pre-commit lint/format; full verify in CI + local before review |
| Q-015 | Add optional deep-TS mode (ts-morph) if Oxc refs weak? | M-011+ | Defer until measured gaps |
| Q-016 | Stack/persona taxonomy: freeze enum vs open string registry? | M-040 | Open string registry + documented well-known IDs ([ADR-0007](./adr/0007-stack-detector-spi.md)) |
| Q-017 | Lighthouse / web perf: ingest-only vs local runner vs cloud? | M-041 | **Resolved: Option B** — opt-in local runner + async PORT callout; SEO/CWV expansions on backlog ([ADR-0008](./adr/0008-stack-aware-measurement-utilities.md)) |
| Q-018 | CWV attribution depth (route vs chunk vs component)? | M-041 | **Resolved: Option C** — rollups + drill to component when attributable; not LCP-only ([ADR-0008](./adr/0008-stack-aware-measurement-utilities.md)) |
| Q-019 | Stack utilities vs Map UI sequencing? | M-041 / M-018 | **Resolved: Option C** — M-041 Gate A (P0+P1+Mono-v1) **before** M-018; remaining packs continue in parallel ([ADR-0008](./adr/0008-stack-aware-measurement-utilities.md)) |
| Q-020 | Privacy for perf utilities / PageSpeed / cloud? | M-041 / M-036 | **Resolved:** reports local only; remote probes consent-only; **no Prism Cloud** ([ADR-0008](./adr/0008-stack-aware-measurement-utilities.md)) |
| Q-021 | Multi-domain monorepo: single stack winner vs per-package? | M-041 / M-013 | **Resolved:** per-package profiles + workspace rollup; package-scoped utilities; additive domains ([ADR-0008](./adr/0008-stack-aware-measurement-utilities.md) D5) |

Update this file when questions are decided; link ADRs.
