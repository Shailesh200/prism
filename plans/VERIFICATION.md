# Recommended Verification Scripts

> Implemented in **M-001**. This document is the contract.

## Unified command

```bash
bun run verify:milestone
```

### Intended pipeline

```text
oxfmt --check → oxlint → typecheck → unit tests → integration tests → build → plan-progress check → (optional) perf
```

Tasks preferably orchestrated by **moonrepo** (`moon run …`).

## Root `package.json` scripts (recommended)

```json
{
  "scripts": {
    "build": "moon run :build",
    "dev": "moon run :dev",
    "typecheck": "moon run :typecheck",
    "lint": "oxlint .",
    "format": "oxfmt .",
    "format:check": "oxfmt --check .",
    "test": "moon run :test",
    "test:integration": "moon run :test-integration",
    "test:e2e": "moon run :test-e2e",
    "verify": "bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build",
    "verify:milestone": "bun run verify && bun run test:integration && bun run scripts/check-plan-progress.mjs"
  }
}
```

## Lefthook

See `plans/TOOLING_AND_CI.md`. Pre-commit runs Oxfmt + Oxlint on staged files.

## `scripts/check-plan-progress.mjs` (recommended behavior)

- Ensure `plans/PROGRESS.md` exists
- Ensure at most one milestone is `In Progress`
- Ensure active milestone branch matches In Progress row when on a milestone branch
- Exit non-zero on violations

## Per-package scripts

Each package should expose moon tasks / package scripts:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  }
}
```

## CI

GitHub Actions job runs the same `bun run verify:milestone` (see `TOOLING_AND_CI.md`).
