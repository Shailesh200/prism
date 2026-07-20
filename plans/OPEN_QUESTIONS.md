# Prism — Open Questions

Resolve these with the owner before or during the indicated milestone. Record answers via ADR when architectural.

| ID | Question | Needed by | Default if unanswered |
|---|---|---|---|
| Q-001 | License: MIT vs Apache-2.0 vs other? | M-001 | MIT |
| Q-002 | Cache location: `.prism/` in workspace vs XDG cache dir? | M-008 | `.prism/cache` in workspace + gitignore |
| Q-003 | Publish scope: GitHub org name / npm scope `@prism` availability? | M-001 / GA | Keep `@prism` locally; rename if taken |
| Q-004 | Cursor extension: separate VSIX vs single VS Code extension? | M-032 | Single extension + Cursor packaging overlay |
| Q-005 | First non-TS language after GA path: Python or Go? | M-034 | Python |
| Q-006 | Hash algorithm: BLAKE3 (native) vs SHA-256 (pure)? | M-005 | SHA-256 first; BLAKE3 later if perf requires |
| Q-007 | Map library: React Flow vs custom Canvas? | M-018 | React Flow |
| Q-008 | Docs framework: VitePress vs Astro? | M-038 | VitePress |
| Q-009 | Will Prism ever offer optional cloud sync? | Post-GA | Not in GA; keep architecture local-first |
| Q-010 | Telemetry: entirely absent vs opt-in anonymous? | M-036 | Entirely absent for GA |
| Q-011 | Support Windows symlink / case-insensitive paths explicitly in M-005? | M-005 | Yes, test on CI later; document quirks |
| Q-012 | Branding: keep product name **Prism** publicly (vs RepoPulse)? | Plan approval | **Prism** |
| Q-013 | Lint/format | M-001 | **Resolved: Oxlint + Oxfmt** (ADR-0003) |
| Q-014 | moon `pre-push` full verify vs CI-only? | M-001 | Prefer pre-commit lint/format; full verify in CI + local before review |
| Q-015 | Add optional deep-TS mode (ts-morph) if Oxc refs weak? | M-011+ | Defer until measured gaps |

Update this file when questions are decided; link ADRs.
