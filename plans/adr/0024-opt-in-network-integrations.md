# ADR-0024: Opt-in network integrations gate

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-23 |
| Decision makers | Owner |
| Related milestones | M-046, M-036 (privacy hardening later) |
| Related | ADR-0004 (Core-only / local-first), ADR-0008 (measurement consent) |

## Context

Prism Core analysis is **local-first** and must not make surprise network calls
(ADR-0004). Product depth for DevOps CI live runs and Frontend PageSpeed Insights
requires optional remote APIs. Owner decision for M-046: ship **opt-in** real
GitHub + PageSpeed when enabled; scaffold Argo / Jenkins afterward.

There is no Prism Cloud; any remote call is user-consented and results stay local.

## Decision

Add a Settings master toggle: **Allow network integrations** (off by default).

When **off**:

- No outbound network from integrations connectors
- Surfaces may still detect local config (workflows, ingest files) and import /
  paste reports

When **on**:

- **GitHub** connector may fetch live workflow / run data for the configured repo
  (and Other Repo CI where implemented)
- **PageSpeed Insights** connector may call Google’s API for consented URLs
- Argo / Jenkins remain scaffolds in M-046 Phase 3 unless explicitly enabled later

Core analysis paths that are not behind an integration connector remain
network-free. Consent aligns with ADR-0008 measurement privacy.

## Options Considered

### Option A — Opt-in network: GitHub + PageSpeed (recommended)

- Pros: real product depth; clear user gate; local default preserved.
- Cons: token / API key UX and failure modes to design.

### Option B — Local-only this epic (import/paste only)

- Pros: zero network risk.
- Cons: Active Pipelines and PageSpeed stay stubby; defers owner ask.

### Option C — Always-on remote when credentials present

- Pros: fewer toggles.
- Cons: surprises users; conflicts with privacy default.

## Consequences

- Positive: honest local-first default with an explicit upgrade path
- Positive: Integrations catalog can show real connector status
- Negative: secrets storage and rate-limit handling needed for GitHub / PageSpeed
- Follow-up: M-036 may harden telemetry / network audit; Argo/Jenkins go live later

## Compliance

- [ ] Updates Master Plan if roadmap impacted
- [ ] Updates package README(s) if API impacted
- [x] Linked from milestone doc (M-046)
