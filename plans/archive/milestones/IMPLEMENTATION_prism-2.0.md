# Implementation — Prism 2.0

| Field | Value |
|---|---|
| Status | **Superseded** (archived 17 Oct 2026) |
| Contract | [`PROGRAM_prism-2.0.md`](./PROGRAM_prism-2.0.md) |
| ADR | [`../adr/0057-prism-intelligence-unified-product.md`](../../adr/0057-prism-intelligence-unified-product.md) **Accepted** |
| First code | M-078 after this contract (M-077) Verifies **and** `fix/mcp-console-dashboard-sanity` lands on `main` |
| Public identity | **`prismate.io`** · GitHub org **`prismate`** · npm **`@prismate`** |

This is the **how**. The program is the **what**. Do not invent scope here. One git milestone at a time. Folder moves + re-exports. **No engine rewrite.**

**Identity (locked):** `https://prismate.io` (marketing + `/demo/<fixture>`). `https://app.prismate.io` (`/mcp`, `/cli`, `/ide` → Marketplace). GitHub `prismate`. Published npm: `@prismate/mcp`, `cli`, `core` only. IDE is **not** an npm package.

---


## Status (17 Oct 2026)

Superseded together with PROGRAM_prism-2.0: there is no `prismate.io`, `@prismate`, Dashboard or package merge. Kept for history only. Current status is in [PROGRESS.md](../../PROGRESS.md).

## 1. How it works after

```text
Host chat / TUI  ──MCP──►  Prism Intelligence
   │                         │
   │  Live Relay             ├── @prismate/core   (analysis SDK, same API)
   │  (steer, pause,         ├── engine folders     (analyzer…map — untaught)
   │   cancel, retry)        └── jobs runtime       (not inside Core)
   │
   └── same product, different host ──►  Prism Dashboard
                                          Overview · Iris · Jobs · Skills
                                          DNA · Trends · Impact & Guard
                                          Integrations · Settings
```

Three hosts, one Dashboard bundle:

| Host | Today | After |
|---|---|---|
| Loopback `:17330` | Dispatch Console (Pulse/Board/List, Trees, Findings) | Unified rail. Copy says Dashboard, not Dispatch Console. |
| IDE webview | app-shell (Map, Domains, Testing, Guard sibling) | Same rail as the daemon. |
| Website `/demo/<fixture>` | GSAP theaters / playground name | `https://prismate.io/demo/<fixture>` read-only named snapshot (**M-086**, last). Fixture name is owner TBD. |

Agents get **one** first read (`repository_overview` scoreboard + `open[]`). Verbs stay tools. Live job control stays in this chat. The Dashboard Jobs tab is the archive.

---

## 2. What we are building (the product)

**Prismate** — local tooling that tells an agent (and a human) what a repository is, what to open, what already exists, what will break, and how much of an answer reached the model.

| Piece | Role |
|---|---|
| Iris | Index + Envelope + Prepare. The agentic aperture. |
| Envelope | Receipts (bytes kept vs dump, truncation). Child of Iris. |
| Prepare | Pack before edit. |
| Impact & Guard | File surface + blast / review / safe-delete / rename / test-impact / Guard. |
| Jobs | Archive: history, diffs, verify readout, land, Findings action. |
| DNA | Identity catalog + Trees widget. |
| Trends | Health history + Pulse token chart. |
| Dashboard | One rail. Three hosts. |

Not an LLM. Not a named worker. Not three apps.

---

## 3. Sanitization — what leaves the face

Cut the **face**, not the engine. Core methods and MCP registrations stay until a dedicated drop (one major of shims). Instructions, nav, and website stop teaching the cut list.

### 3.1 Products / names that die

| Today | After |
|---|---|
| Dispatch (product) | Job runtime. UI: **Jobs**. Speech: teammate. |
| Spectrum / Repository Map (product + widget) | **Gone.** `RepositoryMapView` unmounted. `getRepositoryMap` stays, untaught. |
| Playground (product) | Absorbed into Dashboard / `/demo`. |
| Domains (feature) | **Gone.** No tab, chips, theater. `getDomainReport` / `getBackendReport` stay, untaught. |
| Testing & Security (tab) | Overview health headlines only. |
| Pulse / Board / List | Die as destinations. Token chart → Trends. History → Jobs. |
| Trees (Console rail) | Widget on DNA. |
| Findings (Console rail) | Action/mode on Jobs. |
| Guard (sibling nav) | One **Impact & Guard**. |
| Integrations extras | Remote Git, GitHub Actions, PageSpeed/CWV, GitHub App, Argo, Jenkins, host-connectors list **off the page**. |

User-facing names we keep: **Prism, Iris, Envelope, Jobs.** Spectrum, Domains, Playground, Dispatch-as-product leave copy.

### 3.2 Two rails today → one rail

**Spectrum / app-shell** (`AppSidebar`, playground, IDE webview):

Overview · Repository Map · Domains · Testing & Security · DNA · Trends · Impact · Guard · Dispatch (new tab) · Integrations · Settings

**Dispatch Console** (`CONSOLE_VIEWS`):

Dashboard (Pulse/Board/List) · Findings · Iris · Trees · Skills · Settings

**Target rail (both hosts):**

| # | Tab | What it is | What it is not |
|---|---|---|---|
| 1 | Overview | Repo, health strip, activity | Map, Domains chips, live Pulse |
| 2 | Iris | Index, Envelope, Prepare | Map |
| 3 | Jobs | History, diffs, verify, land, Findings button | Pause/Cancel/Resume/steer/retry; token chart |
| 4 | Skills | Skills editor | — |
| 5 | DNA Analysis | Stack, landmarks, packages, features, **Trees widget** | Domain chips / theater |
| 6 | Trends | Health history, movers, **TokenCostChart** | — |
| 7 | Impact & Guard | File tree + Open / See impact / Bookmark + blast/review/Guard | Map illustration |
| 8 | Integrations | MCP Server, CLI, VS Code, Cursor | Network connectors, host-connectors list |
| 9 | Settings | One combined settings page | — |

Not on the rail: Envelope (child of Iris), What’s new (Settings/footer), Wake/sleep (chrome).

### 3.3 Redirects (keep old hashes)

| Old hash | Lands on |
|---|---|
| `#/map` | Overview |
| `#/domains` `#/domain` | DNA |
| `#/testing` | Overview |
| `#/guard` `#/explain` `#/blast` `#/review` | Impact & Guard (tab if present) |
| `#/trees` | DNA |
| `#/findings` | Jobs with Findings mode |
| `#/dashboard` `#/jobs` (Console Pulse) | Jobs |
| `#/intelligence` | Iris |
| File/path deep-link | Impact & Guard with that target |

### 3.4 MCP — teach vs hide

**Hero (instructions teach these):**  
`repository_overview` · `prepare_change` · `blast_radius` · `review_changes` · `guard_session` · `find_symbol` · `list_findings` · `start_job` · `list_jobs` · `job_control` · `start_my_day` · `workspace_status`

**Hide (still registered one major):**  
`backend_report` · `testing_report` · `security_report` · `repository_map` · `feature_graph` · `knowledge_graph` · `explore_code` · `work_order` · `changed_paths` · `breaking_change_hints` · `engineering_health` · `health_history` · `landmarks` · `stack_profile` · `list_packages` · `search_symbols` · `queue_finding` · `capabilities`

**Keep, not hero:**  
`find_references` · `dependency_route` · `dependency_cycles` · `safe_delete` · `rename_impact` · `test_impact` · `agents_md` · `remember` · `working_set` · `use_skill` · `init` · `sleep` · `wake` · `configure` · `dispatch_doctor` · `job_logs` · `explain_area` · `dependency_graph` · `list_features`

`repository_overview` default payload: identity line, health headlines, bounded landmarks, coupling/activity, `open[]` for `identity | packages | landmarks | features | health | history | engineering`. No domain chips. No map expand.

`wake` copy: drop “Spectrum at …” when Spectrum is gone (M-080). Live Relay (**M-079**) drops “Watch live at …”.

### 3.5 CLI grouping (M-080)

| Rail | Command |
|---|---|
| Overview | `prism overview` (health + activity). Deprecate `map` in help. |
| Iris | `prism iris` / `prism envelope` |
| DNA | `prism dna` (`--expand` identity/packages/landmarks/features) |
| Trends | `prism trends` (health history). Token chart stays Dashboard. |
| Impact | `prism impact` / `prism guard` |
| Install | `prism mcp add` (writes Claude / Cursor / Desktop / Codex config) |

Hide in help one release: `backend`, `bundle`, domain report names. Keep CI gates: `review --fail-on`, `blast --fail-on`, `cycles --fail-on`.

---

## 4. Public identity, install, demo, npm

Locked 2026-09-19. This is the cutover contract for names and install. No product code in M-077.

### 4.1 Two public hosts

| Host | Role |
|---|---|
| `https://prismate.io` | Marketing, docs, **demo**. `prismhq.in` 301s here. |
| `https://app.prismate.io` | Product app: MCP HTTP, CLI installer, IDE Marketplace landing. |

GitHub org: **`prismate`**. Repo can stay `prism` → `github.com/prismate/prism`. Today’s remote is `Shailesh200/prism`.

### 4.2 Advertised install (Voqalize shape)

```bash
# MCP
claude mcp add --transport http prism https://app.prismate.io/mcp/

# CLI
curl -fsSL https://app.prismate.io/cli | bash
# or
npx -y @prismate/cli

# MCP package (stdio fallback)
npx -y @prismate/mcp
```

| Surface | Where it lives | Not |
|---|---|---|
| MCP HTTP | `https://app.prismate.io/mcp/` | A cloud indexer of the visitor’s disk |
| CLI | `https://app.prismate.io/cli/` + `@prismate/cli` | A second product name |
| IDE | Marketplace (VS Code, Open VSX, Cursor). Landing `https://app.prismate.io/ide` | **Not an npm package** |
| Demo | `https://prismate.io/demo/<fixture>` | Not under `app.` |

`prism mcp add` still writes host config files. Prefer the advertised HTTP URL when pairing is up; loopback `http://127.0.0.1:17330/mcp` works before DNS; stdio + `npx @prismate/mcp` is the fallback for “I just opened a folder.”

The hosted `/mcp` is the **product MCP URL**. Binding a local checkout is pairing with the local daemon — not an upload. `/demo` stays a fixture. See §4.7 for the suggested pairing wire.

### 4.3 Why IDE is not npm

Users install the extension from the **Marketplace**, not `npm i`. Publishing `@prismate/ide` would be a fourth public package nobody should install. The VSIX is built from `packages/ide` (today `vscode-extension` + `cursor-extension` overlay). `app.prismate.io/ide` is a page with the Marketplace / Open VSX / Cursor buttons and the existing Cursor deeplink. Marketplace publisher id moves to `prismate` in **M-081**.

### 4.4 npm packages going forward

**Public registry — only these three:**

| Package | Role | Replaces |
|---|---|---|
| `@prismate/mcp` | MCP server | `@repo-prism/mcp-server` |
| `@prismate/cli` | `prism` binary | `@repo-prism/cli` |
| `@prismate/core` | analysis SDK | `@repo-prism/core` |

Folder on disk may stay `packages/mcp-server` until M-084; the **published name** is `@prismate/mcp`.

**Workspace-private (do not publish):** `shared`, `engine`, `dashboard`, `jobs`, `plugin`, `test-support`, and the IDE sources (VSIX only).

**One major of shims:** `@repo-prism/mcp-server` → `@prismate/mcp` (same for `cli`, `core`). Then remove.

### 4.5 Demo URL — `prismate.io/demo/<fixture>`

Not `/demo` alone. A **named** canned repo:

| Example | What the visitor sees |
|---|---|
| `/demo/prepare` | Default story: Prepare + Envelope + blast on the fixture (v1) |
| `/demo/impact` | Optional later: Impact & Guard path |
| `/demo/<other>` | Only if we ship another frozen index |

Implementation (**M-086**): Next route `apps/website/app/demo/[fixture]/…`. Unknown fixture → 404 or redirect to `/demo/prepare` (or the owner-named default). Each fixture is **precomputed JSON** in the website build unless the owner later chooses live. Honest caption: “Real Prism index of a public fixture, frozen in this build.” Owner names the fixture repo later — do not invent one here.

Do **not**: live-index visitor code, spawn a job, accept a zip, put demo under `app.`.

Homepage hero embeds or deep-links `/demo/prepare`. Click-path: Overview → Iris → Impact. Jobs tab = recorded cards.

### 4.6 Which milestone ships which piece

| When | Work |
|---|---|
| **M-080** | Loopback Streamable HTTP on the daemon (`:17330/mcp`). Package publish *name* `@prismate/mcp` in source. Instructions + `prism mcp add` teach the advertised `app.` URL and write loopback until pairing exists. stdio fallback stays. No public DNS required. |
| **M-081** | Marketplace publisher `prismhq.repo-prism` → `prismate`. VSIX / Open VSX / Cursor. Not npm. |
| **M-084** | Folder `packages/surfaces/mcp` publishes `@prismate/mcp`. IDE packaging stays VSIX. Do **not** move the git remote yet. |
| **M-086 (last)** | Buy/point domain + `app.` subdomain. Create GitHub org + npm org. 301 `prismhq.in`. Site + `/demo/<fixture>`. Pairing gateway on `https://app.prismate.io/mcp/`. Remote → `github.com/prismate/prism`. First public publish under `@prismate/*`. |

Owner may register the names earlier (so nobody else takes them). The **cutover steps** still run in M-086 so DNS, orgs, remotes, and publish happen in one verified milestone.

### 4.7 Suggested pairing — how HTTP MCP stays local-first

The advertised command is locked:

```bash
claude mcp add --transport http prism https://app.prismate.io/mcp/
```

What was underspecified: how that URL talks to a checkout on the user’s disk without Prism becoming a cloud indexer. **Suggested v1 (accept or amend later; do not implement until M-080 / M-086):**

```text
Host chat  --HTTP MCP-->  app.prismate.io/mcp   (pairing gateway)
                                │
                                │ outbound session (device-code / pairing token)
                                ▼
                         local Prism daemon :17330
                                │
                                ├── Streamable HTTP /mcp   (same tools as stdio)
                                └── @prismate/core  (analysis on disk)
```

**Rules**

1. The hosted `/mcp` is a **router**, not an indexer. It never lists or uploads the visitor’s tree. Tool results are whatever the paired local engine returns.
2. Unpaired sessions get a short “install local Prism” + link to `/demo/<fixture>` — or optionally the **fixture MCP** (same frozen index as the website demo). Never “paste a path and we will index it.”
3. The local daemon already owns jobs + Intelligence. Add **Streamable HTTP** on the same process at `http://127.0.0.1:17330/mcp` (M-080). stdio `npx @prismate/mcp` stays.
4. Pairing: after `prism mcp add` (or first Dashboard wake), the daemon opens an **outbound** WebSocket/SSE to `app.` with a short device code the user confirms once. Hosted `/mcp` multiplexes JSON-RPC onto that connection. No inbound port-forward, no Cloudflare tunnel required for v1.
5. Until M-086 DNS exists, `prism mcp add` writes the **loopback** URL. The advertised public command stays in docs so the install line does not change twice.

**Do not** (rejected)

- Hosted MCP that accepts a filesystem path and indexes it on our servers.
- Browser WASM / live index of a private tree on `/mcp`.
- A second analysis engine in the website.

M-080 ships loopback HTTP + the taught URL. M-086 stands up the public hostname and the pairing gateway.

### 4.8 Identity cutover runbook (M-086 — do these steps then)

These are the missing how-to steps. Run them on the M-086 branch (or as owner ops the same week), then `verify:milestone`. Do not invent a demo fixture here.

#### A. Domain `prismate.io`

1. Buy `prismate.io` at the registrar (Cloudflare Registrar, Porkbun, or Namecheap). Enable registrar lock + 2FA.
2. In Vercel (website project): **Add domain** `prismate.io` and `www.prismate.io`.
3. At the DNS host:
   - Apex: Vercel’s A / AAAA (or CNAME flattening if DNS is Cloudflare).
   - `www` → CNAME `cname.vercel-dns.com`.
4. Wait for Vercel TLS. Check `https://prismate.io` serves the site (not a parking page).
5. Optional: CAA / email later. Not in scope unless the owner wants Google Workspace that week.

#### B. App subdomain `app.prismate.io`

1. Same Vercel team: add `app.prismate.io` (same project or a thin `app` project).
2. DNS: `app` → CNAME `cname.vercel-dns.com`.
3. Routes on that host (implementation, not just DNS):
   - `/mcp` — Streamable HTTP pairing gateway (§4.7). Health check must not require a workspace.
   - `/cli` — install script (`curl -fsSL …/cli | bash`) that installs `@prismate/cli`.
   - `/ide` — Marketplace / Open VSX / Cursor buttons (publisher from M-081).
4. Wait for TLS. Check the three paths return 200 (or a documented pairing challenge), not the marketing homepage.

#### C. GitHub org `prismate`

1. https://github.com/account/organizations/new → org name **`prismate`**. Owner is the billing/admin account.
2. Create or **transfer** `Shailesh200/prism` → `prismate/prism` (repo Settings → Transfer). Transfers issues/PRs/stars.
3. On the M-086 machine (after owner approval to change remotes):

   ```bash
   git remote set-url origin git@github.com:prismate/prism.git
   git remote -v
   ```

4. Re-add Actions secrets that lived on the old repo (npm token, Marketplace PAT, Vercel if any).
5. Update clone URLs in README, website, docs, `CONTRIBUTING`.
6. Do **not** force-push. Do **not** push unless the owner asks (same hard rule as every milestone).

#### D. npm org `@prismate`

1. https://www.npmjs.com/org/create → **`prismate`**. Enable 2FA on the owner.
2. Add the CI publish user as a member with publish rights (`npm org:user`).
3. On M-086, package.json names are already `@prismate/{mcp,cli,core}` from M-080/M-084. First public publish:

   ```bash
   npm publish --access public   # in each of mcp, cli, core
   ```

4. Deprecate the old names (do not delete):

   ```bash
   npm deprecate @repo-prism/mcp-server "Use @prismate/mcp"
   npm deprecate @repo-prism/cli "Use @prismate/cli"
   npm deprecate @repo-prism/core "Use @prismate/core"
   ```

5. Verify:

   ```bash
   npx -y @prismate/cli --help
   npx -y @prismate/mcp --help
   ```

#### E. Site + demo + 301s (same milestone)

1. Apex site: one product, install lines use `app.` URLs, `/ide` → Marketplace.
2. `https://prismate.io/demo/<fixture>` — fixture **named by the owner**. Precomputed JSON unless checkpoint 2 is reopened.
3. 301 `prismhq.in` (and `www`) → `https://prismate.io`.
4. Click-path smoke: Overview → Iris → Impact. Jobs = recorded cards. No visitor upload.

#### F. M-086 verification (same ritual as every phase)

`bun run verify:milestone` + the manual list in `M-086_website-demo-identity.md`. Then owner review → commit when asked → local merge → Verified → what-changed snippet.

---

## 5. In-depth change catalog

### M-077 — Prism 2.0 (this branch, docs only)

- ADR-0057 **Accepted**. Program **Approved**. This file **Approved**.
- Master Plan §3 rewritten to one product.
- `PROGRESS.md`: M-077 In Progress, then Verified on merge.
- No product code. Same §8.1 ritual as every earlier phase.
- After Verified: land `fix/mcp-console-dashboard-sanity` before M-078.

### M-078 — Dashboard shell (first code)

Unify the two rails and sanitize the face. **Do not** merge packages yet. **Do not** delete Core.

#### A. One nav + router

| File | Change |
|---|---|
| `packages/app-shell/src/AppSidebar.tsx` | Nine items only. Drop Map, Domains, Testing, Guard-sibling, Dispatch-new-tab. `AppView` shrinks; keep old ids as aliases that navigate to the new ones. |
| `packages/dispatch-hub/src/dashboard/router.ts` | Same hash table as app-shell. `CONSOLE_VIEWS` becomes the nine. Pulse/Board/List hashes → Jobs. |
| `packages/dispatch-hub/src/dashboard/console-app.tsx` | Render the unified shell, not a second product rail. |
| `apps/playground/src/hash-route.ts` | Same aliases. Tests in `hash-route.test.ts`. |
| `packages/app-shell/src/PrismTour.tsx` | Tour steps match the nine tabs. Drop map/domains steps. |

#### B. Unmount Repository Map

| File | Change |
|---|---|
| `packages/ui/src/RepositoryMapView.tsx` | Stop mounting from Dashboard hosts. Component may linger unused until M-082/M-083; do not rewrite. |
| `packages/app-shell/src/OverviewScreen.tsx` | Remove map / “Open Repository Map” CTAs. Health strip + activity only. |
| `packages/vscode-extension/src/webview/app.tsx` | Unmount `RepositoryMapView`. Default view = Overview. |
| `packages/vscode-extension/src/extension.ts` | `prism.openRepositoryMap` → open Dashboard Overview or Impact (alias, do not break the command id this milestone if tests pin it — hide from palettes / retarget). |
| Playground map host | Same unmount. |

File-zoom tree + Open / See impact / Bookmark already belong conceptually on Impact (`BlastRadiusScreen` + `FileExplorer`). Wire **See impact** (today a dead button on the map sheet) to the existing blast run. Bookmark if we keep it: Impact sheet, not a map product.

#### C. Drop Domains feature (UI)

| File | Change |
|---|---|
| `packages/app-shell/src/AppSidebar.tsx` | No Domains item. |
| `packages/app-shell/src/DomainScreen.tsx` + `domains/*` | Unhook from the router. Do not delete Core `getDomainReport`. Screens can stay in the tree unmounted until M-082 cleanup. |
| `packages/app-shell/src/DnaScreen.tsx` | No domain chips, no “Explore Domains”. |
| `packages/app-shell/src/OverviewScreen.tsx` | No domain theater. Testing/security = health factor headlines. |
| `packages/app-shell/src/TestingSecurityScreen.tsx` | Unhook. `#/testing` → Overview. |

#### D. Impact & Guard

| File | Change |
|---|---|
| `packages/app-shell/src/BlastRadiusScreen.tsx` | This **is** `#/impact`. Tabs: Explain / Blast / Review + Guard panel (or a Guard tab). |
| `packages/app-shell/src/GuardScreen.tsx` | Render inside Impact, not a sibling nav. |
| File explorer | Keep / promote the existing `FileExplorer` on the blast landing. Actions: Open, See impact (real blast), Bookmark. |

#### E. DNA + Trees widget

| File | Change |
|---|---|
| `packages/dispatch-hub/src/dashboard/trees-view.tsx` | Mount on DNA, scoped to the selected workspace. Keep open-in-IDE / compose / land deep-links to Jobs. |
| `packages/app-shell/src/DnaScreen.tsx` | Host the widget. Drop Trees from the Console rail. |
| Router | `#/trees` → `#/dna`. |

#### F. Trends + token chart

| File | Change |
|---|---|
| `packages/dispatch-hub/src/dashboard/pulse-view.tsx` | Extract `TokenCostChart` (+ `job-cost.ts` aggregations). Pulse live sections are not a destination. |
| `packages/app-shell/src/TrendsScreen.tsx` | Mount the chart as a Pulse block above/beside health history. |
| `packages/dispatch-hub/src/dashboard/job-cost.ts` | Move or re-export so Trends can call it without importing Pulse. |

#### G. Jobs tab — archive, no live controls

| File | Change |
|---|---|
| `packages/dispatch-hub/src/dashboard/job-actions.tsx` | **Strip** Pause, Cancel, Resume, Add instruction, dirty-confirm “Start anyway”, Retry. Keep view/details, copy link, export logs, Keep all / land, Findings, delete-from-board. |
| `packages/dispatch-hub/src/dashboard/job-actions.test.ts` | Assert live ids are absent on Dashboard rows. |
| `packages/dispatch-hub/src/dashboard/findings-view.tsx` | Jobs action/mode, not `#/findings` rail. `#/findings` → Jobs + mode. |
| `packages/app-shell/src/JobsScreen.tsx` | Same archive rules if it still renders a fleet. |
| Pulse/Board/List views | Stop being nav destinations. Reuse list/detail chrome under Jobs if needed. |

#### H. Integrations — four cards

| File | Change |
|---|---|
| `packages/app-shell/src/IntegrationsScreen.tsx` | Keep `mcp`, `cli`, `vscode`, `cursor`. Remove `git`, `github`, `pagespeed`, `cwv`, `forge`, `argo`, `jenkins`, and the host-connectors list. |
| `packages/app-shell/src/IntegrationsScreen.test.tsx` | Four cards. No PageSpeed / GitHub CI panels. |

Settings may still hold “allow network” for later; it is not an Integrations product.

#### I. Copy

Kill “Playground, Intelligence, and Dispatch”, “Explore Domains”, “Open Dispatch”, “Repository Map”, Pulse/Board/List as names, “Testing & Security” as a product. Console title → Prism Dashboard.

#### J. One design system + Prism-before-each-file (owner 2026-09-19)

The Dashboard shell is where duplicate chrome dies. **No new independent UI.**

**Source of primitives:** `packages/ui` (Button, Badge, CardIcon, EmptyState, Tabs, Input, Tooltip / HoverTip, FileExplorer, tokens). Screens in app-shell, dispatch-hub, playground, and the IDE webview **import from there**. They do not grow a private Card, Empty, or chart “just for this tab.”

**When two already exist** (example: a Spectrum/app-shell card and an Iris/Console card):

1. Find both with Prism (`search_symbols` / `find_symbol` / `explain_area` on the folder).
2. If one is already in `packages/ui`, use that. Delete or stop mounting the other.
3. If both are local, **promote one into `packages/ui`**, then switch both call sites. Do not keep a third.
4. If it is unclear which look is the system — **stop and ask**. Do not assume.

**Token chart:** extract from Pulse into a `packages/ui` (or shared dashboard) primitive before Trends mounts it. Do not copy-paste a second chart.

**Before every file / component / non-trivial hunk in this shell:**

1. `prepare_change` (or `explain_area` on that folder) — pack, reuse, House Style.
2. `find_symbol` / `search_symbols` for the widget name (Card, EmptyState, Badge, …).
3. `blast_radius` on the file you will edit.
4. After the edit, `review_changes` on the session before asking for review.

Do not invent a component because the old Spectrum screen had one and Iris has another. Reuse. Ask if stuck.

**M-078 DoD:** one nav on daemon + playground + IDE webview; no map mounted; no Domains UI; Trees on DNA; token chart on Trends; Jobs has Findings and no Pause/Cancel/Resume; Integrations has four cards; old hashes redirect; **no new private primitives** (everything from `packages/ui` or promoted into it); `bun run verify:milestone` green; Master Plan §8.1 ritual.

**Out of scope:** Live Relay (that is M-079); package merges; deleting Core domain/map code; website rewrite; changing the locked tagline.

**Gate:** M-078 does not open until `fix/mcp-console-dashboard-sanity` is on `main`.

---

### M-079 — Jobs Live Relay

Isolated worker unchanged (checkout/worktree, no shell, Prism verifies and lands). Comes **immediately after** the Dashboard shell so chat steer and the slim Jobs archive ship as one loop.

| Host | Product |
|---|---|
| TUI | Live box in **this** transcript. Steer / Pause / Cancel / Retry via `job_control`. |
| Editor chat | MCP App card in **this** thread. Same tools. |

No “Watch live at Console.” Dashboard Jobs stays the archive (M-078 rules). Options 2 / 4 / 6 stay on hold.

---

### M-080 — Agent + CLI IA

| Work | Detail |
|---|---|
| `packages/mcp-server/src/instructions.ts` | Hero list + one-orient loop from program §8.2. Stop teaching domain reports, `repository_map`, “Watch live at”, “Spectrum at”. |
| `packages/mcp-server/src/tools/orientation.ts` | `repository_overview` cheap scoreboard + `open[]`. `repository_dna` / `repository_health` shim to expand sets. |
| Daemon `/mcp` | Streamable HTTP on `:17330/mcp` (same tools as stdio). See §4.7. |
| `packages/cli/src/registry.ts` | Group help like the rail. `prism overview [--expand]`. Advertised add is the `app.` URL. `prism mcp add` writes **loopback** until M-086 pairing exists. Package folder `mcp-server` publishes as `@prismate/mcp`. |
| Tests | `instructions.test.ts`, CLI help/registry tests, orientation contract, HTTP `/mcp` smoke. |

Do not delete tool registrations. Do not ingest visitor disks. Do not buy DNS here.

---

### M-081 — Marketplace publisher rename

After M-080. Not an npm package.

| Work | Detail |
|---|---|
| VS Code Marketplace | Publisher `prismhq` / extension `repo-prism` → org/publisher **`prismate`**. Follow Microsoft “transfer publisher” or new publisher + deprecate old listing. |
| Open VSX | Same id rename / new namespace. |
| Cursor | Marketplace listing + deeplink on `/ide` (page itself is M-086; ids update here). |
| Repo | `package.json` `publisher`, vsce / ovsx publish CI, README install badges. |
| Tests | VSIX still builds; `verify:milestone`. |

Out of scope: `@prismate/ide` on npm; website rewrite; GitHub/npm org creation.

---

### M-082 — One Dashboard package

Mechanical UI merge. Screens keep working as in M-078 (Live Relay is already in chat from M-079).

```text
packages/dashboard/
  primitives/    ← packages/ui
  screens/       ← app-shell + hub dashboard + playground screens
  daemon/        ← dispatch-hub server entry
```

- IDE webview and `:17330` serve the **same** entry.
- `apps/playground` becomes a thin Vite host or is deleted.
- Website `/demo` will import screens later (M-086); do not put Next inside this package.
- Re-export shims from `@repo-prism/ui`, `@repo-prism/app-shell`, `@repo-prism/dispatch-hub` for one milestone if needed.

---

### M-083 — Engine package merge

```text
packages/engine/
  analyzer/ indexer/ graph-engine/ intelligence/
  impact/ navigation/ repository-map/
```

- Create `packages/engine` with project references.
- Move folders; re-export from old `@repo-prism/intelligence` etc. for one major.
- Point `core` at `engine`. Public Core method names **unchanged**.
- Tests move with folders. `verify:milestone` green.

Forbidden: jobs inside Core; indexer inside MCP; flatten folders into one `src/`.

---

### M-084 — Surfaces + IDE merge

```text
packages/surfaces/  mcp/  cli/  host/
packages/jobs/      ← dispatch (rename when copy is ready)
packages/ide/       ← vscode + cursor overlay (ADR-0020)
```

Publish only `@prismate/mcp`, `cli`, `core`. Keep `@repo-prism/mcp-server` → `@prismate/mcp` as a one-major shim. IDE stays Marketplace (VSIX), not npm. Update moon/workspace/`docs:check`. GitHub remote and npm org cutover wait for **M-086**.

---

### M-085 — Docs trim

Keep public nav: what-is, install, quickstart, understand-a-repo, **dashboard**, **prepare-and-envelope**, Jobs (rename `dispatch.md`), MCP/CLI reference (hero vs advanced), consent, limitations, FAQ.

Unlink architecture long-form (lives in `plans/`). Drop `docs/start/playground.md` as a product. `docs:check` still generates MCP/CLI reference.

---

### M-086 — Website + `/demo/<fixture>` + identity cutover (last)

| Route | Work |
|---|---|
| `/` | Host is **`prismate.io`**. Kicker is `this/self · Local First · No account`. Then the locked tagline, the short paragraph, then install lines (`/mcp`, `/cli`, `/ide`). Do **not** show `He/Him` or `No model`. `prismhq.in` 301s here. |
| `/demo/<fixture>` | Named canned repo (owner names the fixture). Precomputed JSON unless checkpoint 2 is reopened. Click-path: Overview → Iris → Impact. Recorded Jobs cards. No live teammate. No visitor upload. |
| `/products` | One product, named pieces (Iris, Envelope, Jobs, Dashboard). |
| `/features` | Prepare, blast, Guard, DNA+Trees, Trends. Not Domains. Not a map product. |
| `/install` | One line per host. Cursor deeplink kept. |

Plus the identity runbook in **§4.8**: domain, `app.` subdomain, GitHub org, npm org, pairing gateway, first `@prismate/*` publish.

Kill GSAP dummy Pulse-Board-List theaters as the hero.

---

## 6. What we explicitly do not touch (until a later drop)

| Keep in Core / engine | Why |
|---|---|
| `getRepositoryMap` + `packages/repository-map` | Untaught; merge as a folder in M-083 |
| Stack-domain detection, `getDomainReport`, backend/testing/security reports | Untaught; health headlines still use factors |
| Envelope ledger, Prepare, blast, Guard, graphs | The product |
| Job workers, worktrees, verify, land | Jobs runtime (not Core) |
| Old `@repo-prism/*` names | One major of shims, then gone |

**Non-goals:** cloud sync of private trees, `@prismate/ide` on npm, renaming Iris/Core **tool** names, Tree-sitter, new languages, Options 2/4/6.

---

## 7. Sequence and gates

```text
 M-077  docs/plan     ← you are here
        │ merge to main (Verified)
        ▼
 LAND   fix/mcp-console-dashboard-sanity onto main
        │ (hard gate — do not park)
        ▼
 M-078  Dashboard shell (sanitize + one rail)
        ▼
 M-079  Live Relay
        ▼
 M-080  MCP instructions + CLI IA + loopback /mcp
        ▼
 M-081  Marketplace publisher rename
        ▼
 M-082  packages/dashboard
        ▼
 M-083  packages/engine
        ▼
 M-084  surfaces + ide
        ▼
 M-085  public docs trim
        ▼
 M-086  website + /demo + domain / app. / GitHub / npm   (last)
```

M-058 / M-059 stay **beside** this program (Iris quality), not instead of it.

### 7.1 Verification ritual (every row, same as earlier phases)

Master Plan §8.1 + §9 + §10. No lighter process for docs or renames.

1. Branch `milestone/M-XXX-short-name` from latest `main`. Never stack. Never develop on `main`.
2. Working tree only — **no commits** until the owner says approve / commit.
3. `bun run verify:milestone` (typecheck, lint/format, unit, integration, build, `check-plan-progress`).
4. Fix until green. Run that milestone’s manual checklist.
5. Owner review → owner approves → commit on the milestone branch.
6. Owner approves merge → merge **locally** to `main` (no push unless asked).
7. Mark **Verified** in `PROGRESS.md`. Check DoD boxes. Share a short what-changed snippet.
8. Next branch from that `main`.

Docs-only (M-077) still runs `verify:milestone` for the plan-progress gate.

---

## 8. Risk

| Risk | Mitigation |
|---|---|
| Two routers drift | One hash table shared; playground + hub + IDE tests for aliases |
| Map unmount breaks Overview tests | Replace assertions; do not keep a hidden map “for the test” |
| Job action strip misses a Pulse entry | One `JobActions` used everywhere; test forbidden ids |
| Package merge breaks publish | Shims + `check-publish-exports` |
| Copy still says three SKUs | M-086 website + M-085 docs; M-078 Console title |
| Hosted `/mcp` read as “upload your repo” | §4.7 pairing gateway; `/demo/<fixture>` is the only public index |
| Scope explosion into Live Relay | M-079 only; Options 2 / 4 / 6 stay parked |

---

## 9. M-078 smoke (human)

1. Open Dashboard — nine tabs, no Map / Domains / Testing / Trees / Findings / Dispatch.
2. Overview — health + activity, no map.
3. DNA — catalog + Trees widget; no domain chips.
4. Trends — health history + token chart.
5. Impact — pick a file, Open, See impact runs blast; Guard is here.
6. Jobs — history + Findings button; no Pause/Cancel/Resume.
7. Integrations — four cards.
8. `#/map` `#/domains` `#/trees` `#/findings` `#/guard` redirect correctly.
9. IDE webview shows the same rail.
