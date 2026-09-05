# Audit: breaking / broken test cases

**Job:** audit-test-cases  
**Scope:** Static review only (no test runner; worker has no shell).

## Verdict

No broken or “breaking” test cases found that need a fix in this worktree.

## What was checked

- **Focused / skipped suites:** no `it.only` / `describe.only` / `.skip` / `it.todo` / `xit` in package tests.
- **Integration layer honesty:** 7 packages keep `vitest.integration.config.ts`; each has matching `*.integration.test.ts` or `*.contract.test.ts` (12 files total). No live `passWithNoTests` in those configs (`scripts/check-test-layers.mjs` still guards this).
- **Breaking-change coverage (M-021 / M-049):** unit coverage in `packages/impact/src/change-impact.test.ts` and `blast-radius.test.ts`; Core goldens under `packages/core/src/fixtures/` (`rename-base`, `blast-radius-*`, `test-impact-helper`) align with current hint shapes (empty `breakingChanges` on low-fan-in blast goldens is consistent with `WIDELY_USED_THRESHOLD`).
- **MCP contract:** `breaking_change_hints` still covered as deprecated-but-present in `packages/mcp-server/src/server.contract.test.ts`.

## Out of scope here

Runtime pass/fail of the suite (Prism runs typecheck/tests after the worker stops). This note does not claim green CI.
