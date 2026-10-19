# Contributing to Prism

Thanks for looking. Questions and security reports can go to
hello@shaileshjha.in. Prism is developed milestone by milestone against a written
plan, which makes contributing a little different from a typical repository —
please read the workflow section before opening a pull request.

## Setup

```bash
nvm use          # Node 24.18.1, pinned in .nvmrc
bun install
bun run verify:milestone
```

| Tool | Why |
|---|---|
| **Node 24.18.1** | Pinned in `.nvmrc`, `engines` and `.moon/toolchain.yml`; CI uses the same file |
| **Bun 1.3.11** | Package manager and script runner (pinned in `.moon/toolchain.yml`) |
| **moonrepo** | Task graph across the workspace (installed as a dependency) |

If `verify:milestone` is green on a fresh clone, your environment is correct.
If it is not, that is a bug worth reporting — the first run should work.

## How work is organised

The plan is the source of truth, in this order:

1. [`plans/00_MASTER_DEVELOPMENT_PLAN.md`](./plans/00_MASTER_DEVELOPMENT_PLAN.md)
2. The active milestone under [`plans/milestones/`](./plans/milestones/)
3. [`plans/PROGRESS.md`](./plans/PROGRESS.md)

**If the code and the plan disagree, stop and reconcile the plan first.** A
change that quietly makes the plan wrong is worse than no change.

Rules that are not negotiable:

- One milestone in progress at a time.
- One milestone, one branch: `milestone/M-XXX-short-name`, cut from `main`.
- Never develop on `main`; never stack milestone branches.
- Every milestone passes the full verification suite before review.
- Every merge to `main` leaves the repository buildable.
- A new architectural choice needs an ADR in [`plans/adr/`](./plans/adr/).

For a small fix that does not belong to a milestone — a typo, a broken link, an
obviously wrong error message — open a pull request directly and say so.

## Architecture rules

| Rule | Reason |
|---|---|
| Every surface (CLI, MCP, VS Code, Cursor, playground) consumes **`@repo-prism/core` only** | [ADR-0004](./plans/adr/0004-core-only-integration-surface.md). A surface that reaches an engine package directly will drift from the others |
| Never reimplement analysis inside a surface | Same reason. If a surface needs something Core does not expose, add it to Core |
| Core analysis makes **no network calls** | See below. This is enforced by test |
| DTOs live in `@repo-prism/shared` and are Zod-validated | Every surface serialises them |

### The no-network rule for Core

Prism's central promise is that nothing leaves your machine unless you ask.
`packages/core/src/no-network.integration.test.ts` runs the entire analysis
surface with `fetch` and `net.Socket.prototype.connect` replaced by traps that
record the attempt and throw. It also asserts the traps fire, so it cannot pass
vacuously.

Prism 2.0 has no network path in Core at all; the consent subsystem was
removed with the reports that needed it. A change that adds one needs an ADR
first. The only network request Prism makes is the daily update check in
`packages/mcp-server/src/update-check.ts`.

See [ADR-0024](./plans/adr/0024-opt-in-network-integrations.md) and the
[threat model](./plans/architecture/07_THREAT_MODEL.md).

## Verification

```bash
bun run verify:milestone
```

This runs formatting, lint, typecheck, unit tests, integration tests, and a
consistency check between the code and `plans/PROGRESS.md`. Run it before asking
for review; a partial run is not evidence.

Individual gates, when you are iterating:

| Command | What |
|---|---|
| `bun run format` / `format:check` | Oxfmt |
| `bun run lint` | Oxlint |
| `bun run typecheck` | TypeScript across the workspace |
| `bun run test` | Unit tests |
| `bun run test:integration` | Integration tests, including the no-network suite |

Lefthook runs Oxfmt and Oxlint on pre-commit.

## Code style

The linters cover mechanical style, so review attention goes elsewhere. Two
things they cannot check:

**Comments explain why, not what.** A comment that restates the line below it is
noise the moment the code changes. A comment that records a constraint, a
rejected alternative, or a bug that a previous shape caused is worth keeping.

**Tests describe behaviour, not implementation.** `it("refuses a path outside
the workspace rather than analysing it")` survives a refactor;
`it("calls validatePath")` does not.

## Pull requests

- Say what changed and why. The "why" is the part reviewers cannot reconstruct.
- Note anything you deliberately did not do, and why. Deferred work stated up
  front is a decision; deferred work discovered later is a surprise.
- If you touched a public API, update the package README and
  [`plans/guides/CORE_SDK.md`](./plans/guides/CORE_SDK.md).

## Reporting security issues

Please do not open a public issue. See [SECURITY.md](./SECURITY.md).
