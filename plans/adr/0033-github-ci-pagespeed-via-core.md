# ADR-0033: GitHub CI + PageSpeed network via Core consent gate

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-09 |
| Decision makers | Owner, Architect |
| Related milestones | M-053 (T-11 / §2.3), M-051, M-052 |
| Related | ADR-0004 (Core-only), ADR-0024 (opt-in network), ADR-0016 (DevOps CI) |
| Supersedes | M-052 inventory §4 classification that “network adapters stay” in the surface (`github-ci.ts` fetch / PageSpeed) |

## Context

[M-052 inventory §4](../notes/M-052-inventory.md) classified `github-ci.ts` fetch
helpers and `fetchPagespeedMetrics` as **legitimately presentational** — I/O
against third-party APIs that could remain in the surface, with only response
parsing moving inward.

That classification conflicted with:

1. **ADR-0004** — surfaces consume Core only; MCP/CLI must share the same path.
2. **ADR-0024 / M-051** — network authority is `.prism/consent.json` read by Core;
   a surface `fetch` bypasses the gate that `stageDevopsRemote` already uses.
3. **M-053 §2.3** — route `github-ci` through Core with the M-051 consent gate.

Live GitHub Actions list/dispatch and PageSpeed Insights were called from the
webview (and Integrations test buttons) with no Core consent check. Tokens and
API keys stayed client-side, but the *decision* to reach the network did not.

## Decision

**Network for domain CI and PageSpeed goes through Core**, behind the existing
consent purposes:

| Capability | Consent purpose | Core entry |
|---|---|---|
| GitHub workflows / runs / repo / login / test / dispatch | `network.github` | `fetchGithubWorkflows`, `fetchGithubWorkflowRuns`, `fetchGithubRepo`, `fetchGithubAuthenticatedLogin`, `testGithubRepoConnection`, `dispatchGithubWorkflow` |
| PageSpeed Insights v5 | `network.pagespeed` | `fetchPagespeedMetrics` |
| Stage remote DevOps tree (unchanged) | `network.github` | `stageDevopsRemote` |

Pure helpers (`parseGithubRepoRef`, `matchRemoteWorkflowId`, DTO mappers) live in
`@repo-prism/intelligence`. Core orchestrates `fetch` after
`createConsentStore(…).requireGranted(…)`. Surfaces call via `PrismClient`
(HTTP / postMessage); they do not `fetch` GitHub or PageSpeed themselves.

Tokens and API keys remain **per-call inputs**. Core must not persist them or
write them into logs / audit output.

This **supersedes** the M-052 §4 “network adapters stay in surface” line for
GitHub CI and PageSpeed. Local-only presentation (labels, forms, layout) still
belongs in app-shell.

## Options Considered

### Option A — Core + consent for CI / PageSpeed (chosen)

- Pros: one gate for playground, extension, MCP, CLI; matches ADR-0004/0024;
  characterisation tests move with pure helpers.
- Cons: more host/protocol surface; tokens cross the webview→host boundary
  (already true for `stageDevopsRemote`).

### Option B — Keep surface `fetch`, add a soft UI consent check

- Pros: smaller change.
- Cons: MCP/CLI cannot share the path; a forgetful host still leaks requests
  (the exact M-051 failure mode).

### Option C — Only move parse helpers; leave network in app-shell

- Pros: matches old M-052 §4.
- Cons: fails M-053 §2.3 and privacy default.

## Consequences

- Positive: Domain DevOps / Frontend PageSpeed UX unchanged; refusals surface as
  existing `{ ok: false, error }` messages naming consent when ungated.
- Positive: MCP/CLI can expose the same Core functions later without reimplementing
  adapters.
- Negative: playground + extension must wire new RPC/HTTP methods (done in M-053).
- Follow-up: keep MCP/CLI from registering these until agent consent UX exists
  (same rule as `stageDevopsRemote` today).

## Compliance

- [x] Updates Master Plan if roadmap impacted — no roadmap change; M-053 scope
- [x] Updates package README(s) if API impacted — `plans/guides/CORE_SDK.md`
- [x] Linked from milestone doc — M-053 §2.3 / inventory note

## Notes

Inventory note: [M-053-inventory](../notes/M-053-inventory.md) already recorded
that `github-ci` supersedes M-052 §4; this ADR is the decision record.
