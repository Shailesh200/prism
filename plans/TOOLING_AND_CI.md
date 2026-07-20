# Tooling, Hooks & CI

Companion to ADR-0003 and Master Plan §4 / §9.

## Local toolchain

| Tool | Role |
|---|---|
| Bun | Install, script runner, workspaces |
| Node 26+ | Engine compatibility (extensions, native addons) |
| moonrepo | Task graph, caching, toolchain pinning |
| Oxlint | Lint |
| Oxfmt | Format |
| Vitest | Unit / integration tests |
| Vite | Playground / UI bundler |
| Lefthook | Git hooks |
| TypeScript | `tsc` typecheck (strict) |

## Lefthook (chosen) vs Husky

| | Lefthook | Husky |
|---|---|---|
| Install model | Binary + YAML | npm dependency |
| Parallel hooks | Yes | Limited |
| Monorepo fit | Excellent | OK |
| Speed | Typically faster | Fine |

**Prism uses Lefthook.**

### Recommended hooks (M-001)

```yaml
# lefthook.yml (sketch)
pre-commit:
  parallel: true
  commands:
    oxfmt:
      run: bunx oxfmt {staged_files}
    oxlint:
      run: bunx oxlint {staged_files}

pre-push:
  commands:
    verify:
      run: bun run verify:milestone
```

Owner may disable `pre-push` verify if too heavy and rely on CI — decide in M-001.

Optional: `commit-msg` conventional commits via `commitlint` or a small regex check.

## Unified verify (local = CI)

```bash
bun run verify:milestone
```

Pipeline:

1. oxfmt --check  
2. oxlint  
3. moon run :typecheck (or equivalent)  
4. moon run :test  
5. moon run :test-integration  
6. moon run :build  
7. plan-progress check script  

## CI (GitHub Actions) — planned jobs

> Remote CI activates when a remote exists and owner allows push. Until then, local verify is the gate.

### Job: `verify`

- Checkout  
- Setup Bun + Node 26 (respect moon toolchain)  
- `bun install --frozen-lockfile`  
- `bun run verify:milestone`  

### Job: `e2e` (from M-037)

- Playwright against playground / extension smoke  

### Job: `security` (from M-036)

- `bun audit` / osv-scanner  
- Optional CodeQL  

### Job: `perf` (from M-035)

- Indexer/graph budgets on fixtures; fail on regression  

### Branch protection (when remote enabled)

- Require `verify` green before merge  
- No direct commits to `main`  
- Still: **owner approval** required per Hard Rules (human gate beyond CI)

## What “everything” means for quality gates

| Gate | When |
|---|---|
| Format (Oxfmt) | Every commit / CI |
| Lint (Oxlint) | Every commit / CI |
| Typecheck | Every milestone / CI |
| Unit tests | Every milestone / CI |
| Integration tests | When cross-package behavior exists |
| Build | Every milestone / CI |
| Plan progress check | Every milestone |
| E2E | M-037+ |
| Perf budgets | M-035+ where defined |
| Security audit | M-036+ |
| Manual checklist | Every milestone (owner review) |

## Editor recommendations (non-blocking)

- Oxc / Oxlint editor extension  
- EditorConfig  
- VS Code settings recommendations committed in M-001 (optional `.vscode/extensions.json`)
