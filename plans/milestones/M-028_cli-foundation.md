# M-028 — CLI Foundation

| Field | Value |
|---|---|
| Branch | `milestone/M-028-cli-foundation` |
| Status | Not Started |
| Depends on | M-025 |
| Unlocks | M-029 |
| Packages | `@prism/cli` |

## Goal

Ship `prism` CLI binary skeleton: global options, workspace resolution, `--json` flag, exit codes, and `prism --version` / `prism doctor`.

## In Scope

- Commander-based CLI
- Commands: `doctor`, `index` (triggers Core index), `dna` (preview)
- Human + JSON output helpers
- Help text quality
- Package `bin` entry

## Out of Scope

- Full command suite (M-029)
- CI publishing

## Definition of Done

- [ ] `bun run prism doctor` works in repo
- [ ] Exit codes documented
- [ ] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration (CLI spawn) · Build · Manual help review
