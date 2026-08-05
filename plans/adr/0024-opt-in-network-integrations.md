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

## Amendment 2026-08-05 (M-036) — one authority, six purposes

The master toggle above was implemented in browser `localStorage`, and the Core
gate it was supposed to drive accepted `consentGranted: true` from its caller.
Every host passed it unconditionally. The result was a gate that **recorded**
consent instead of requiring it, a `.prism/consent.json` no user knowingly
wrote, and a second, disagreeing toggle that bound only the webview — never a
direct SDK, MCP or CLI caller.

What replaces it:

| Before | After |
|---|---|
| One "Allow network integrations" switch | Six purposes, each decided separately |
| Authority in `localStorage` | Authority in `.prism/consent.json`, read by Core |
| Caller passes `consentGranted` | Caller passes nothing; Core reads the record |
| Purpose = internal job kind | Purpose = the consequence, in the user's terms |

The purposes are `network.github`, `network.pagespeed`,
`network.package-install`, `network.git-remote`, `network.gravatar` and
`run.local-build`. Each carries text stating what will happen and which host it
reaches; that text is what the prompt and the refusal message both show.

Three paths that were ungated are now gated: `stageDevopsRemote` (Core reads the
record itself, so no surface can route around it), `git fetch --prune` (was
behind the *git integration* toggle, not a network one), and the Lighthouse CLI
install (its own purpose, separate from agreeing to run Lighthouse).

Gravatar is the notable default change. Contributor avatars used to be fetched
from gravatar.com behind no toggle at all, disclosing a hash of every
committer's email to a third party. Avatars are now drawn locally; Gravatar is
opt-in and off. The legacy `localStorage` toggle migrates to `network.github`
and `network.pagespeed` only — nobody who flipped it was told it meant Gravatar,
so treating it as consent would be inventing agreement.

Enforcement is a test, not a promise:
`packages/core/src/no-network.integration.test.ts` runs the full analysis
surface with `fetch` and `Socket.prototype.connect` replaced by traps that
record and throw, and it verifies the traps themselves fire — otherwise the
suite would pass just as happily if they were never installed.

## Compliance

- [ ] Updates Master Plan if roadmap impacted
- [ ] Updates package README(s) if API impacted
- [x] Linked from milestone doc (M-046, M-036)
