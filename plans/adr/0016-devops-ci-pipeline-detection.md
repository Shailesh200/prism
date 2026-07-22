# ADR-0016: DevOps · Platform — CI/CD pipeline detection & Integrations roadmap

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-22 |
| Decision makers | Owner, Architect |
| Related milestones | M-043 (UI + local detection), M-045 (DevOps / Integrations — planned) |
| Supersedes | — |

## Context

The DevOps · Platform domain screen renders the `iac-resources` utility overlay.
Until now that overlay only detected infrastructure-as-code **files**
(`terraform`, `helm`, `kubernetes`, `container`) with a `{ path }` attr, and the
file walker (`listRepoFiles`) skipped all dot-directories — so `.github/`, and
therefore CI/CD workflows, were invisible.

Owner requirements:

1. **Now (local):** detect GitHub Actions workflows from the repo.
2. **Product:** see **active pipelines** (live / recent runs) and **trigger** a
   pipeline — when the workflow declares a request dispatcher
   (`workflow_dispatch` / `repository_dispatch`), the UI must match that
   contract (inputs form, event-type picker, or “no manual dispatcher”).
3. **Later:** Integrations with **Argo**, **Jenkins**, pipelines from **other
   repos**, and other important DevOps surfaces.

Per ADR-0004, analysis stays in Core; networked integrations are **opt-in** and
must not run on Core’s default local-only path.

## Decision

### Phase A — Local detection (shipped in M-043)

Extend `iac-resources` to detect **GitHub Actions** workflows:

- Read `.github/workflows/*.{yml,yaml}` directly (repo-level; skipped when a
  `packageId` is scoped).
- Emit one `ci` node per workflow with attrs:
  - `path`, `provider: github-actions`
  - `events`, `jobs` / `jobCount`
  - `dispatchers` (`workflow_dispatch`, `repository_dispatch` when present)
  - `canTrigger` (boolean)
  - `inputs` (JSON of `workflow_dispatch.inputs` — name, type, required,
    description, default)
  - `dispatchTypes` (`repository_dispatch.types` when declared)
- Playground shows:
  - **Active Pipelines** card — empty state until GitHub Integration is connected
  - **CI/CD Pipelines** card — definitions + **dispatcher-aware Trigger UI**
    (form / type picker / “no manual dispatcher”), buttons **disabled** until
    Integrations wires the API

No fabricated run status. No YAML dependency (conservative line reader).

### Phase B — GitHub Integration (M-045 / Integrations tab)

Opt-in, networked, behind Integrations:

| Capability | API surface (indicative) |
|---|---|
| Active / recent runs | List workflow runs (status, branch, duration, actor, conclusion) |
| Trigger · `workflow_dispatch` | Create workflow dispatch with typed inputs from Phase A |
| Trigger · `repository_dispatch` | Create repository dispatch with selected `event_type` |
| Auth | User-supplied token / gh CLI; never baked into Core analysis |

### Phase C — Later Integrations & DevOps expansions

**Rule (owner): integration-gated cards.** DevOps domain cards that depend on an
external system (Argo, Jenkins, other-repo CI, …) appear **only when that
integration is connected** in Settings → Integrations. No connected integration
→ no card (and no fabricated data). Discoverability can use a single “Available
integrations” teaser until Settings ships.

Blocked on **Settings / Integrations** tab. Implement after that surface exists.

| Integration (when connected) | DevOps cards to unlock |
|---|---|
| **GitHub Actions** (Phase B) | Active Pipelines (live runs); enable Trigger / Dispatch |
| **Argo CD / Argo Workflows** | Applications / sync status; sync waves; drift; recent deploys |
| **Jenkins** | Jobs / folders; last build; queue; trigger build |
| **GitLab CI / CircleCI** (candidates) | Pipelines & jobs analogous to GitHub Actions |
| **Other-repo / multi-remote CI** | Pipelines sourced from linked repos (not only this workspace) |

Other high-value DevOps views (local or integration-backed as appropriate):
environments & promotion paths, container image inventory & unused tags,
**Topology / IaC resource dependency DAG** (deferred until Core emits real
edges — Terraform refs / K8s ownerRefs / Helm — not the current single
`related` placeholder), secret/policy scan surface, deploy freeze windows,
runbook / SLO links.

### Topology (explicit deferral)

Do **not** ship a Topology graph UI on DevOps until `@prism/intelligence`
`iac-resources` (or a successor) produces meaningful `graph.edges` from local
IaC. A UI over the placeholder edge would fabricate structure. Track as a
small Core + DevOps UI follow-up after that capability lands.

## Consequences

- Local-only path stays private; Trigger/Active stay gated until Integrations.
- UI already adapts to dispatcher shape so enabling GitHub is mostly wiring.
- No overlay-kind enum change; `ci` is a free `GraphNodeDto.kind` string.

## Non-goals (Phase A)

- Live run status without Integrations
- Executing triggers without opt-in credentials
- Parsing full jobs→`needs` DAG / Build→Test→Deploy staging (future)
