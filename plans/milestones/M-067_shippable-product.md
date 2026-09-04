# M-067 — Shippable Product

| Field | Value |
|---|---|
| Status | **Verified** — merged to main 2026-09-04 |
| Branch | `milestone/M-067-shippable-product` (from latest `main`) |
| Depends on | M-066 (Checkout-first Jobs), M-064 (Agent Dashboard Hub), M-062 (UI Actionability) |
| Unlocks | GA re-cut on the plugin-pack shape |
| Packages | `@repo-prism/dispatch`, `@repo-prism/dispatch-hub`, `@repo-prism/mcp-server`, `@repo-prism/app-shell`, `@repo-prism/ui`, `@repo-prism/plugin` (new), `apps/website` |
| Supersedes | [ADR-0036](../adr/0036-dispatch-auth-broker.md), [ADR-0037](../adr/0037-dispatch-connect-ux.md), [ADR-0043](../adr/0043-agent-dashboard-hub.md) (two-port split) |
| Amends | [ADR-0032](../adr/0032-website-gsap-motion.md), [ADR-0035](../adr/0035-dispatch-vertical.md), [ADR-0040](../adr/0040-dispatch-worker-supervisor.md), [ADR-0041](../adr/0041-dispatch-worker-resource-budget.md), [ADR-0044](../adr/0044-dispatch-worker-backends.md) |
| Adds | ADR-0046 (`claude --bg`), ADR-0047 (job queue + latency), ADR-0048 (Console), ADR-0049 (host-delegated integrations), ADR-0050 (plugin pack + worker MCP), ADR-0051 (shared motion) |

## 1. Goal

Close the four structural gaps found in the 2026-09-02 audit and leave Prism
shippable: an intelligence engine, a fast job runner, and a host-native plugin
pack — with the website and IDE surfaces telling the truth about all three.

The four gaps:

1. **The job clock measures the wrong thing.** `elapsedMs` is
   `now - createdAt` where `createdAt` is stamped at enqueue, before git setup
   and before a login that can take 180s. It never ticks, a finished job's time
   keeps growing, and the statusline uses `updatedAt` so one job shows two
   durations in two places.
2. **There is no queue.** No `queued` status exists. Dirty-tree, overlap and
   the RAM/disk/admission gates all return *without creating a job*. `ready`
   counts toward the cap, so job #2 is refused while job #1 is still logging in.
3. **Two loopback UIs compete.** `:17330` (Dispatch, token + SSE) and `:17321`
   (Core bridge, no token, `Access-Control-Allow-Origin: *`). A complete
   `JobsScreen` is mounted nowhere while a separate single-column board ships.
4. **~4k lines of OAuth feed exactly one feature.** Six drivers, a hosted
   broker, one Prism-owned OAuth app per vendor — and only `start_my_day`
   reads a token. Meanwhile workers get `mcpServers: {}` and cannot call a
   single Prism tool while they work.

## 2. Scope — seven phases

One branch. Each phase is independently verifiable; run
`bun run verify:milestone` at every phase boundary.

| ID | Problem | Fix |
|---|---|---|
| **P-S1** | Job clock lies; no queue; `start_job` blocks on auth + git. | Split `createdAt`/`queuedAt`/`startedAt`/`finishedAt`; client-side elapsed; one shared duration formatter; `queued` status + drain scheduler; `start_job` under 500ms; gates become visible job states; atomic `jobs.json`. |
| **P-S2** | Two loopback UIs; orphaned `JobsScreen`; no router, no loading state, undefended numbers. | One Console daemon on `:17330` with an always-on Jobs plane and a lazy Intelligence plane; retire `:17321`; adopt `JobsScreen`; hash router; real empty/loading/error states; data-integrity rules; `prism.localhost`. |
| **P-S3** | 4k lines of first-party OAuth for one feature. | Read-only host discovery (names only, never tokens); `start_my_day` becomes local spine + host fill contract; then delete `dispatch-auth`, six drivers, OAuth stack, `integrations` tool, website `/oauth/*`, six `network.*` Dispatch purposes. |
| **P-S4** | MCP never composes itself; workers have no Prism access. | `packages/plugin` emitting a Cursor- and Claude-compatible pack with `review-pr`, `safe-change`, `verify-regression`, `ship`, `onboard` skills; worker-role Prism MCP over the Console (shared index); trim the ~10k-token surface. |
| **P-S5** | Website and IDE describe a product that no longer exists. | Dispatch + Console + Plugin Pack on `prismhq.in`; promote `McpInstallPanel`; rewrite every doc P-S3 falsifies; `check-docs` rule for removed identifiers; IDE MCP card with live status, Host Connectors, Jobs/Workflows nav. |
| **P-S6** | Motion is marketing-only; docs and IDE were excluded. | Shared `@repo-prism/ui` motion module; website cursor, scrollbar, route loader, section reveals; docs section reveals + TOC scroll-spy; IDE meaningful-only motion behind a dynamic import with a bundle budget. |
| **P-S7** | Automated suites do not catch a dead button or a blank page. | Hands-on smoke of every surface, then a written report stating plainly what is verified, broken, skipped or still missing. |

## 3. Out of scope

| Deferred work | Why / destination |
|---|---|
| Codex and Gemini worker backends | ADR-0044 seam already exists; separate milestone |
| `SystemDiagram` measure-draw-MotionPath choreography | Large build for a docs figure; revisit post-ship |
| HTTPS on a custom loopback name | Requires shipping a private key or hosted cert minting; both rejected |
| Prism jobs inside Cursor's subagents view | No external registration API exists; Cursor subagents are conversation-scoped |
| Windows manual verification | No machine available; called out in the P-S7 report |

## 4. Definition of Done

- [x] Only one milestone `In Progress`
- [x] P-S1: four timestamps; elapsed ticks client-side and freezes on finish; one formatter across board, detail, `list_jobs`, statusline; `queued` + drain loop; `start_job` under 500ms; gates create visible jobs; atomic writes
- [x] P-S2: single daemon, two planes; `:17321` retired; `JobsScreen` adopted and `dashboard/board.tsx` deleted; router with Jobs/Workflows/Repos/Intelligence; loading, empty and error states; no number rendered that cannot be defended; `prism.localhost` resolves and `127.0.0.1` still works
- [x] P-S3: host discovery returns names only; `start_my_day` fill contract replaces connector fetch; `dispatch-auth` and the six drivers deleted; no `auth.prismhq.in` reference survives
- [x] P-S4: plugin pack builds for both hosts; five skills; workers reach Prism intelligence through the Console without a second index
- [x] P-S5: website and IDE describe the shipped product; `docs:check` catches removed identifiers
- [x] P-S6: shared motion module; website chrome; docs prose untouched; IDE bundle within stated budget
- [x] P-S7: hands-on smoke complete; report written and shared
- [x] `bun run verify:milestone` green
- [x] Owner approval → commit → merged to `main`

## 4a. P-S7 ship-gate report

Run on 2026-09-03 against a built tree: Console daemon `1.1.16` on `:17330`,
website production build on `:3000`. Every number below was read off a running
process, not inferred from the code.

### Verified by hand

| Claim | Evidence |
|---|---|
| `start_job` under 500ms (P-S1) | **17ms**. Returns "Queued … It starts on its own", job durable on disk before the call returns. |
| A gate becomes a visible state, not a silent failure (P-S1) | Queued into a tree with 217 uncommitted files. The drain moved the job to `needs_confirm` and wrote the question onto the record. `list_jobs` speaks it *first*, ahead of the finished job. |
| Voice never leaks internals (ADR-0039) | Both surfaces say `ship-gate-smoke`, never `job-<hex>`, never a worktree path. |
| The clock stops (P-S1) | The one pre-P-S1 record — terminal status, no `finishedAt` — no longer counts up against the present. |
| One daemon, two planes (P-S2) | `/api/healthz` reported `intelligence.loaded: false`. One `listPackages` call returned real package data in **1.4s**; health then reported `loaded: true`. Core is loaded on demand, not at boot. |
| `:17321` retired (P-S2) | Nothing listening. The three surviving mentions are all retirement notices. |
| Host connector discovery (P-S3) | Returned the real Cursor plugins on this machine — Google Calendar, Linear, Notion and others — with names, transports and skill lists. No credential is read and no network call is made. |
| The OAuth stack is gone (P-S3) | `packages/dispatch-auth` and `apps/website/app/oauth` deleted. **Zero** code references remain; `PRIVACY.md`, `docs/concepts/consent-and-privacy.md` and `OWNER_HANDOFF.md` describe the broker in the past tense and tell the owner to decommission the DNS record and revoke the vendor apps. |
| Plugin pack builds for both hosts (P-S4) | 5 skills, 3 commands, `.cursor-plugin/` and `.claude-plugin/` manifests, and an `mcp.json` byte-identical in content to the install config the website serves. |
| No Core in any browser bundle | `better-sqlite3`, `tree-sitter` and `@repo-prism/core` all absent from both the webview and Console bundles. |
| No GSAP in the webview (ADR-0051) | Absent from `dist/webview/app.js`. The bundle-budget claim holds because the bundle was never added. |
| Website content renders without JavaScript | The only `opacity:0` in the server HTML is the `aria-hidden` route-loader bar. Every heading, stat and list row is present and visible. |
| Staggered lists always finish | `/features` and `/products`: 14 of 14 rows at opacity 1. Counters settle on the true values. |
| Gates | `verify:milestone` green; `docs:check` green (44 pages, 4 generated artifacts current). |

### Found by the gate, and fixed

Three defects that every unit test passed over, because each needed a real
record or a real failure to appear.

1. **A finished job read `0s` when it had run for eight minutes.** P-S1 taught
   the clock to stop at `updatedAt` for records with no `finishedAt`, which
   fixed a job counting up to "17h 30m". But `updatedAt` is the last write to
   the *record*, and this one froze 203ms after creation while the worker kept
   writing for another eight minutes. `endOfLifeFor` now takes the later of
   `updatedAt` and `lastHeartbeat`. The board went from `0s` to `8m 15s`,
   which matches the heartbeat. Same defect as "17h 30m", opposite direction.
2. **The dirty-checkout gate rendered all 217 changed paths.** One job card
   became a 217-row scroll with the two buttons it exists for buried at the
   bottom. It now lists eight and says "and 209 more files."
3. **A rejected read claimed to still be loading.** `loading` means "no
   successful read yet", which never clears when the token is expired, so the
   subtitle promised to read repositories it would never be allowed to see.
   It now says so. Found by restarting the daemon, which rotates the token.

### Not verified, and why

- **The IDE panel was not opened in a real VS Code window.** Its Console
  integration was exercised at the seam instead: `console-link.test.ts` (5) and
  `host-dispatch.integration.test.ts` (13) pass, and the two endpoints the panel
  calls were driven by hand against the live daemon. What remains unproven is
  the rendering itself — the Jobs and Workflows screens and the rebuilt
  Integrations tab have not been seen inside an editor.
- **Windows.** No machine, as scoped out above.
- **A job has not been driven to `done` end to end on this branch.** The smoke
  job stopped at the dirty-tree gate, which is the correct behaviour for this
  working tree but means the `running → needs_review → done` path was verified
  from stored records and tests rather than by watching it happen.

### Known rough edges

- A first-time `prismhq.localhost` visitor needs the token in the URL. That is
  the security model working, but it does mean the bare hostname alone shows an
  unauthorised page.
- Approvals live on Jobs (banner + sort), not a separate Workflows tab —
  one board is enough until multi-step plugin runs ship.
- **Pre-existing, not caused by this branch:** two `lab-server` tests fail if
  the developer has anything listening on `:3000`. `discoverLabUrl` scans the
  common dev ports, finds the real server and returns `ok` where the test
  expects a rejection. It cost time to diagnose during this gate. Out of scope
  here; worth a follow-up that pins the scan to the port under test.

## 5. References

- [ADR-0043](../adr/0043-agent-dashboard-hub.md) Hub (two-port split superseded by ADR-0048)
- [ADR-0045](../adr/0045-job-placement-checkout-first.md) Checkout-first placement
- [ADR-0044](../adr/0044-dispatch-worker-backends.md) Worker backends
- [ADR-0029](../adr/0029-signal-provenance.md) Signal provenance (extended to jobs in P-S2)
- [ADR-0032](../adr/0032-website-gsap-motion.md) Website motion (widened by ADR-0051)
- `plans/notes/M-066-claude-bg-spike.md` — the spike P-S1 resolves
- `plans/UX_SIMPLICITY.md` — one canvas, one inspector; motion must not add surfaces
