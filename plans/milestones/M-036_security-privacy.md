# M-036 — Security & Privacy Hardening

| Field | Value |
|---|---|
| Status | **In Review** |
| Branch | `milestone/M-036-security-privacy` (from latest `main`) |
| Depends on | M-051, M-052 |
| Unlocks | M-039 |
| Packages | repo-wide |
| Amends | [ADR-0024](../adr/0024-opt-in-network-integrations.md) |
| Source | Security & privacy audit 2026-08-05 |
| Decisions | Q-009 no cloud sync · Q-010 no telemetry, confirmed by owner 2026-08-05 |

## 1. Goal

Make Prism's central promise — *local-first, nothing leaves your machine unless you ask* — true in
code and provable by test, not just stated in ADRs.

The audit found the promise is **mostly** kept: Core analysis is network-free, the security report
is local-only, no telemetry exists, and no credentials reach `.prism/`. But the consent mechanism
that is supposed to enforce it has a structural hole, and there is one entirely ungated outbound
call.

## 2. Findings (audit 2026-08-05)

### F1 — The consent gate is bypassed by every caller *(high)*

`ConsentStore.requireGranted` is enforced in exactly one place
(`packages/intelligence/src/utilities/jobs.ts:177–185`) and is satisfied when the caller passes
`consentGranted: true`. **Every host passes it unconditionally:**

| Caller | Line |
|---|---|
| `packages/vscode-extension/src/session.ts` | 449–451 (Lighthouse), 530 (bundle analyze) |
| `apps/playground/vite.config.ts` | 488 (Lighthouse), 554 (bundle analyze) |
| `packages/app-shell/src/BundleWeightPanel.tsx` | 301 |

No production code ever calls `workspace.setConsent()` or `getConsent()`. The gate therefore
records consent rather than requiring it. A `.prism/consent.json` file exists that no user ever
consciously wrote.

### F2 — Two unrelated consent systems *(high)*

| System | Storage | Scope |
|---|---|---|
| Core `ConsentStore` | `.prism/consent.json` | Utility jobs |
| UI `allowNetworkIntegrations` | browser `localStorage` (`prism.settings.v1`) | GitHub, PageSpeed |

ADR-0024 describes one master toggle. There are two, they disagree about what is gated, and the
authoritative one lives in `localStorage` — meaning a direct SDK, MCP or CLI caller is bound by
neither.

### F3 — Gravatar is contacted with no gate at all *(high)*

`packages/app-shell/src/Avatar.tsx:38–44` renders `<img src="https://www.gravatar.com/avatar/…">`
built from an MD5 of a committer email (`avatar-util.ts:53`). This is an unannounced third-party
request that leaks *who works on the repository* to a company the user never opted into, from a
product whose headline claim is local-first. It is behind no toggle whatsoever.

### F4 — `stageDevopsRemote` reaches GitHub ungated *(high)*

`packages/core/src/stage-devops-remote.ts:106–257` calls `api.github.com` immediately with no
consent check. The UI happens to gate it (`DomainScreen.tsx:855–890`), but the playground API
(`vite.config.ts:928–934`) and extension host (`host-dispatch.ts:481–491`) do not — and any direct
SDK caller certainly does not. Already listed as M-051 task 4.5; if that lands first, this becomes
verification rather than new work.

### F5 — Lighthouse install hits the npm registry inside a "local" job *(medium)*

`lighthouse-runner.ts:248–315` runs `bun add lighthouse@12` / `npm install lighthouse@12`. The job
is consent-gated, but the consent text is about running Lighthouse, not about installing a package
tree from the network. Users should be told which of the two they are agreeing to.

### F6 — `git fetch` gated by the wrong flag *(medium)*

`host-dispatch.ts:315` and `vite.config.ts:823` run `git fetch --prune` behind
`isGitIntegrationEnabled()`, not the network toggle. `git fetch` is unambiguously network access.

### F7 — Repository content influences spawned commands *(medium)*

Bundle analyze and the lab preview server run `npm run <scriptName>` where both the script name and
its body come from the target repository's `package.json`
(`bundle-analyze-runner.ts:487–510`, `lab-server.ts:402–429`). This is inherent to the feature —
running a project's own build is the point — but it means **opening a repository in Prism and
clicking Analyze executes arbitrary code from that repository**. That deserves to be stated plainly
in a threat model rather than discovered.

### F8 — No security documentation *(medium)*

No `SECURITY.md`, no `CONTRIBUTING.md`, no threat model. Privacy claims are scattered across
`02_LLD.md` §12, `03_TECH_STACK.md` and four ADRs.

## 3. Scope — phases

### Phase 1 — Make consent real

| Task | Detail |
|---|---|
| 1.1 | One consent authority in Core. `.prism/consent.json` becomes the single source of truth; the UI toggle writes to it rather than to `localStorage` |
| 1.2 | Remove `consentGranted: true` from every host call site. Consent is *read*, never *asserted* by the caller |
| 1.3 | `consentGranted` becomes a Core-internal concept; the host API instead surfaces a "consent required" outcome the UI can prompt on |
| 1.4 | Migration: existing `localStorage` setting is read once and written to `.prism/consent.json`, then ignored |
| 1.5 | Distinct purposes rather than one master switch: `network.github`, `network.pagespeed`, `network.package-install`, `network.git-remote`, `run.local-build`, `run.local-tests` |
| 1.6 | Every purpose carries user-facing text stating exactly what will happen; the Lighthouse install (F5) gets its own purpose |
| 1.7 | MCP refuses consent-gated paths (M-026 §3); CLI requires explicit `--yes` (M-028 §3). Neither may auto-grant |

### Phase 2 — Close the ungated paths

| Task | Detail |
|---|---|
| 2.1 | Gate `stageDevopsRemote` on `network.github` inside Core, so no caller can route around it |
| 2.2 | Gate `git fetch` on `network.git-remote` in both the extension host and the playground API |
| 2.3 | **Gravatar**: default to locally generated identicons — Prism already has `avatar-util.ts` and can derive a deterministic avatar without a request. Remote Gravatar becomes opt-in under `network.gravatar`, off by default |
| 2.4 | Gate the Lighthouse CLI install on `network.package-install`, separately from running Lighthouse |
| 2.5 | Audit the webview CSP (`prism-panel.ts:589`) and narrow `connect-src` to what is actually reachable after the above |

### Phase 3 — Prove it

| Task | Detail |
|---|---|
| 3.1 | **No-network test harness**: run the full Core analysis suite with outbound sockets stubbed to throw. Any attempt fails the test |
| 3.2 | Apply it to: index, graphs, DNA, health, map, blast, engineering health, testing report, security report, code explorer |
| 3.3 | Test that each consent-gated path refuses cleanly when consent is absent — no hang, no partial side effect |
| 3.4 | Test that no DTO in the Core surface contains a token, key or credential field |
| 3.5 | Wire the no-network suite into `verify:milestone` so a future network call cannot land silently |

### Phase 4 — Document

| Task | Detail |
|---|---|
| 4.1 | `SECURITY.md`: supported versions, how to report a vulnerability, response expectations |
| 4.2 | `CONTRIBUTING.md`: setup, milestone workflow, verification, the no-network rule for Core |
| 4.3 | `plans/architecture/07_THREAT_MODEL.md`: trust boundaries, what Prism executes and why (F7 stated plainly), what leaves the machine and under which consent, what is stored and where |
| 4.4 | `PRIVACY.md`: no telemetry, no cloud, no analytics — with the test that proves it (Q-009 / Q-010) |
| 4.5 | Update ADR-0024 to describe the unified consent model as built |

## 4. Out of scope

- Making Prism a SAST tool. The security *report* stays a local checklist ([ADR-0022](../adr/0022-testing-security-reports.md))
- Sandboxing spawned build scripts. F7 is documented, not solved — real sandboxing is a large piece of work with its own milestone
- Vulnerability database lookups (they would require network)
- Signing or provenance attestation for the published extension (M-039)
- Encrypting `.prism/` — it holds derived local data, not secrets

## 5. Definition of Done

- [x] Only one milestone `In Progress`
- [x] One consent authority; no caller can assert consent on the user's behalf
- [x] Every finding F1–F8 closed or explicitly accepted with a reason in this document
- [x] Gravatar off by default; avatars render locally with no request
- [x] No-network test suite passes and is part of `verify:milestone`
- [x] Every consent purpose has user-facing text stating what will happen
- [x] `SECURITY.md`, `CONTRIBUTING.md`, `PRIVACY.md`, threat model all present
- [x] ADR-0024 updated to match the implementation
- [x] Q-009 and Q-010 marked resolved in `OPEN_QUESTIONS.md`
- [x] `bun run verify:milestone --force` green
- [ ] Manual: fresh workspace, no `.prism/consent.json` — every gated action prompts, none proceeds silently
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 9. Findings disposition (2026-08-05)

| Finding | Disposition |
|---|---|
| F1 consent gate bypassed | **Closed.** `StartUtilityJobInput.consentGranted` deleted. The job service reads `.prism/consent.json` and nothing else; the three hosts that passed `true` no longer have a field to pass |
| F2 two consent systems | **Closed.** `.prism/consent.json` is the only authority. `allowNetworkIntegrations` survives solely as migration input and is never consulted for a decision |
| F3 Gravatar ungated | **Closed.** Avatars draw locally; `network.gravatar` is opt-in and off. The legacy toggle deliberately does **not** migrate into it — that switch never mentioned Gravatar, so honouring it would be inventing agreement |
| F4 `stageDevopsRemote` ungated | **Closed.** Core reads the record itself; the `consentGranted` parameter is gone from the function, the webview protocol, and its runtime guard |
| F5 Lighthouse install | **Closed.** `network.package-install` is its own purpose, checked in `ensureLighthouseCli`. An already-installed binary needs no gate: using it sends nothing |
| F6 `git fetch` wrong flag | **Closed.** `network.git-remote` in both the extension host and the playground API |
| F7 repository code execution | **Accepted and documented**, as §4 anticipated. Gated behind `run.local-build`, whose text says the script is the repository's code running with your permissions; stated plainly in the threat model §4. Sandboxing remains out of scope |
| F8 no security docs | **Closed.** `SECURITY.md`, `CONTRIBUTING.md`, `PRIVACY.md`, `plans/architecture/07_THREAT_MODEL.md` |

### Notes

Six purposes shipped, not the seven listed in 1.5: `run.local-tests` was
dropped. Running the repository's *tests* is what a developer does constantly
and what the Testing screen exists for; gating it would produce a prompt
everybody clicks through, which is worse than no prompt because it teaches
people that Prism's prompts are noise. `run.local-build` is kept because bundle
analysis is occasional and its script is far more likely to be unfamiliar.

The no-network harness traps `fetch` and `net.Socket.prototype.connect` rather
than the `node:http` module functions — ES module namespaces are frozen, and the
socket is the chokepoint every one of them ends at anyway. It also asserts the
traps fire, because a harness that silently failed to install would produce the
most dangerous kind of green.

CSP narrowing (2.5) removed the blanket `https:` from `img-src` and `font-src`.
That wildcard is what made the Gravatar leak invisible: nothing had to be
allowed, because everything already was.

## 6. Verification plan

| Kind | Check |
|---|---|
| Unit | `requireGranted` refuses when no record exists — with no caller-supplied override available |
| Unit | Consent migration from `localStorage` runs once and is idempotent |
| Contract | No Core DTO contains a token/key/credential field |
| Integration | Full analysis suite with sockets stubbed to throw — zero outbound attempts |
| Integration | Each gated path with consent absent → clean refusal, no side effect |
| Integration | `stageDevopsRemote` called directly from the SDK without consent → refused |
| Integration | Avatar rendering issues no network request by default |
| Manual | Fresh clone, fresh workspace: exercise every gated feature and confirm the prompt text matches what actually happens |

## 7. Risks

| Risk | Mitigation |
|---|---|
| Unified consent breaks existing users' flows | Migration in 1.4 preserves prior intent; anything ambiguous defaults to *not granted* |
| Removing `consentGranted: true` breaks all three hosts at once | Phase 1 lands host-by-host with the Core gate accepting both shapes for one milestone |
| Local identicons look worse than Gravatar | Deterministic, brand-consistent identicons; Gravatar remains available opt-in |
| The no-network harness is flaky under Vitest | Stub at the `node:http`/`node:https`/`fetch` boundary, not by firewall; assert on attempts, not timeouts |
| Prompting for six purposes is annoying | Purposes are coarse and remembered; a single "allow network integrations" convenience grant covers the network group |

## 8. References

- [ADR-0024](../adr/0024-opt-in-network-integrations.md) · [ADR-0022](../adr/0022-testing-security-reports.md) ·
  [ADR-0008](../adr/0008-stack-aware-measurement-utilities.md) · [ADR-0010](../adr/0010-sqlite-cache-location.md)
- `plans/architecture/02_LLD.md` §12 · [M-051](./M-051_hardening.md) task 4.5
- Q-009, Q-010 in [`OPEN_QUESTIONS.md`](../OPEN_QUESTIONS.md)
