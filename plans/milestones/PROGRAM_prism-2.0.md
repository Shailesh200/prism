# Program — Prism 2.0

| Field | Value |
|---|---|
| Status | **Approved** |
| Date | 2026-09-18 |
| Approved | 2026-09-19 (owner) |
| Companion ADR | [`../adr/0057-prism-intelligence-unified-product.md`](../adr/0057-prism-intelligence-unified-product.md) **Accepted** |
| Implementation | [`IMPLEMENTATION_prism-2.0.md`](./IMPLEMENTATION_prism-2.0.md) |
| First milestone | [`M-077_prism-2.0.md`](./M-077_prism-2.0.md) (this branch) |
| Last milestone | [`M-086_website-demo-identity.md`](./M-086_website-demo-identity.md) (demo + domain / `app.` / GitHub / npm) |
| Does **not** | Delete packages, rewrite engines, or implement Live Relay in M-077 |
| Engineering rule | One git milestone at a time from latest `main`. **Land** `fix/mcp-console-dashboard-sanity` on `main` before M-078 (do not park). Every milestone uses Master Plan §8.1 + §9 + §10 (`bun run verify:milestone` → owner review → commit only when asked → local merge → Verified → what-changed snippet). |

This is **Prism 2.0**: the concrete plan to streamline Prism into one intelligence product for AI agents and the humans who watch them — without rewriting Iris, graphs, prepare, Envelope, or impact.

---

## 0. Locked intent (approved 2026-09-19)

| Topic | Decision in this plan |
|---|---|
| What we sell | **Prismate** — local tooling that tells an agent (and a human) what a repository is, what to open, what already exists, what will break, and how much of an answer actually reached the model. Display name in repo, IDE, and domain is **Prismate**. Tagline **locked** (see §0.1). |
| What we are not | Not an LLM product. Not a fleet of named workers. Not three apps (Dispatch / Spectrum / Intelligence). Not a fleet OS. Marketing may call Prismate the teammate. |
| Dispatch | **Not a product.** It is the job runtime behind **Jobs** on the Dashboard. Chat may still say “teammate.” Packages may still be named `dispatch` until the merge milestone. |
| Spectrum / Repository Map | **Removed from the product.** A map whose only job is “showing the map” is not a use case. Unmount `RepositoryMapView` from Dashboard hosts. File tree + Open / See impact / Bookmark live on **Impact & Guard**. Engine `getRepositoryMap` stays; do not teach `repository_map`. Website may keep a still, not a live map product. |
| Console + Playground + IDE webview | **One Prism Dashboard.** Same bundle, three hosts (loopback daemon, IDE webview, public `/demo`). |
| Jobs | **Live Relay** in TUI + editor is the cockpit (2026-09-19). Dashboard **Jobs** tab stays: history / verify / land + **Findings** action. **No** Pause / Cancel / Resume / steer / retry on the Dashboard — those are chat-only. Token chart → Trends. Options 2, 4, and 6 stay **on hold**. |
| Sanitize | Drop the **Domains feature** completely (tab, chips, theater, taught domain reports). Drop the **Repository Map** UI. Pulse/Board/List leave the face. Integrations = MCP + CLI + Extensions only. Do **not** delete Core algorithms in the first pass. See §8.1. |
| Intelligence logic | **Do not rewrite.** Merges are folder moves + re-exports. Public Core methods and MCP tool names stay until a dedicated rename milestone (none in this program unless owner asks). |
| Public identity | **Locked 2026-09-19 (relocked same day):** domain `prismate.io`. App host `https://app.prismate.io`. GitHub org `prismate`. npm `@prismate`. MCP package is **`@prismate/mcp`** (not `mcp-server`). |
| Install (Voqalize shape) | MCP: `claude mcp add --transport http prism https://app.prismate.io/mcp/`. CLI: `https://app.prismate.io/cli/`. IDE: Marketplace (VS Code / Open VSX / Cursor), landing `https://app.prismate.io/ide` — **not an npm package**. npm MCP: `@prismate/mcp`. |
| Public demo | `https://prismate.io/demo/<fixture>` — read-only Dashboard on a named canned repo (e.g. `/demo/prepare`). Not `app.`. Never the visitor’s tree. |
| Cloud / accounts | Unchanged: local-first, Q-009 closed, Q-010 absent. Public `/demo` uses a **canned fixture repo**, never the visitor’s private tree. |
| Current sanity branch | **Landed** on local `main` (`92fa6b5`, 2026-09-19). M-078 may open after M-077 Verifies. |
| Design system | One system. `packages/ui` is the only place new primitives are born. Dashboard / Iris / old Spectrum / playground **reuse**, they do not invent a second Card, EmptyState, Button, or chart. If two exist, pick one and delete the other from the face — **ask the owner** if which one is unclear. |
| UI work habit | Before each Dashboard file or component: use Prism intelligence (pack, blast, find existing symbol). Do not assume a new widget is needed. When in doubt, **ask**. |

### 0.1 Tagline — locked (owner, 2026-09-19)

Product name is **Prismate**. The teammate’s name in copy is **Prism**. Not an LLM.

**Hero (two lines)**

> A teammate meant for you.  
> Intelligent enough for all you want to do.

**Kicker** (locked)

> this/self · Local First · No account

Do **not** ship `He/Him` or `No model`.

**Under the hero (short paragraph)** — no he / him / his

> The name is Prism. It’s your personal teammate. It always stays with you. It remembers the project. It grows with you. It helps you write only the good stuff. It knows what you have already built. It is still there when you come back.

Do not name DNA, Prepare, Envelope, Jobs, or Skills on this paragraph. Do not rewrite this on the site, IDE, or Dashboard without asking. Do not invent a second tagline.

---

## 1. The product (one sentence)

**Prismate** is the local engine an agent calls before it edits, and the single Dashboard a human opens to see Iris, Envelope, impact, and jobs.

```text
Agent (Cursor / Claude / Codex / …)
    │  MCP
    ▼
Prism Intelligence (Core + Engine)
    │
    ├── CLI  (same IA, scripts / CI)
    ├── IDE  (same Dashboard webview)
    └── Dashboard daemon  (same Dashboard in the browser)
```

Surfaces are **hosts**. They do not each own a product name.

---

## 2. Single Prism Dashboard — information architecture

One rail. One hash router. Combined settings. No Repository Map. No Domains feature.

| Route | Nav label | What it shows (reuse existing screens; do not rewrite engines) |
|---|---|---|
| `#/overview` | Overview | Repo picker, health/testing/security strip (health factors, **not** the Domains feature), activity. No map widget. No live Pulse cockpit. |
| `#/iris` | Iris | Index status, Envelope (pipe metrics + More details), Prepare history. This is the agentic aperture. |
| `#/jobs` | Jobs | **Slim archive, not the cockpit.** History, diffs, verify status, land, **Findings** action. **No live controls** on this tab: strip Pause, Cancel, Resume, Add instruction, dirty-confirm “Start anyway”, Retry. Those stay `job_control` in TUI / editor chat. Token spend chart does **not** live here — it goes to Trends. |
| `#/skills` | Skills | Existing skills editor. |
| `#/dna` | DNA Analysis | DNA + stack + landmarks + packages + features, plus a **Trees widget** (today’s Console Trees page: primary checkout + linked git worktrees, branch, dirty, job chips). **No** Domains tab, chips, or per-domain theater. Trees is not its own rail item. |
| `#/trends` | Trends | Health history / region movers (existing Trends), plus today’s Pulse **token usage chart** (`TokenCostChart`) as a Pulse block on this page. Spend is a trend, not a Jobs cockpit. |
| `#/impact` | Impact & Guard | **The file surface.** Today’s map file-zoom tree plus the map sheet options (**Open**, **See impact**, **Bookmark**) live here — wired, not a dead “See impact” button. Blast, review, safe-delete/rename/test-impact, **Guard** session ranking. No map illustration. One place for “is this change safe?” |
| `#/integrations` | Integrations | **MCP Server, CLI, Extensions** (VS Code + Cursor) only. Drop Remote Git, GitHub Actions, PageSpeed / CWV, GitHub App / forge, Argo, Jenkins, and the host-connectors list from this page. No Prism OAuth. |
| `#/settings` | Settings | **One** settings page: workspace list, standup/job prefs (today Dispatch), IDE/analysis prefs (today Spectrum/app-shell), privacy/consent, wipe. |

**Envelope details** stay a child of Iris (`#/iris/envelope` or a drawer), not a sibling product.

**Findings** sit on **Jobs** as a separate action button / mode (today’s `FindingsView`), not a top-level rail and not under Impact. Queue-from-finding stays.

**Wake / sleep** stay Dashboard chrome (down page), not a nav item.

**What’s new** can live under Settings or a footer link.

### Hosts of the same Dashboard

| Host | How |
|---|---|
| Loopback | Today’s `dispatch-hub` on `:17330` — keep the daemon, drop the “Dispatch Console” name in UI copy. |
| IDE | VS Code / Cursor webview loads the **same** dashboard bundle via `host-session` RPC (already the extension ↔ Console contract). |
| Public demo | `https://prismate.io/demo/<fixture>` mounts a **read-only** dashboard against that named fixture (no job spawn, no wipe, no token that can see the visitor’s disk). |

`apps/playground` is absorbed: its screens become Dashboard routes or the `/demo` host. It stops being a third app name.

---

## 3. CLI shares the same intelligence structure

CLI is not a different product. Commands **group like the rail**. Implementation stays Core calls.

| Dashboard | CLI (target) | Today’s commands that fold in |
|---|---|---|
| Overview | `prism overview` | `health` summary + activity. Deprecate `map` in help. |
| Iris | `prism iris` / `prism envelope` | Envelope is Console-only today — add a read of the local ledger; Prepare via `prepare` if we expose it |
| Jobs | `prism jobs` | Dispatch is MCP-only today — optional later; not a blocker |
| DNA | `prism dna` | `dna`, `stack`, `packages`, `landmarks`, `features` as flags/subcommands. Trees stay Dashboard-only unless we add a later `dna --trees` |
| Trends | `prism trends` | `health --history` / `engineering` time slice. Token chart stays Dashboard (Pulse block). |
| Impact & Guard | `prism impact` / `prism guard` | `blast`, `review`, `safe-delete`, `rename`, `test-impact`, `guard` |
| Skills | `prism skills` | `use_skill` analogue if needed |
| Settings | `prism doctor` / `prism configure` | doctor, consent |
| **Install** | `prism mcp add` | writes Claude / Cursor / Desktop / Codex config — §4.4 |

**Keep as CI gates (not “features”):** `prism review --fail-on`, `prism blast --fail-on`, `prism cycles --fail-on`.

**Deprecate in help (still work one release):** long unique names that only wrap a hidden report (`backend`, `bundle`, …) unless Impact still needs them.

MCP **instructions** use the same map: hero tools per rail, others available if asked. Do not delete tool names in the first milestones.

---

## 4. Website and docs

### 4.1 What Voqalize does that we should steal

Voqalize ([voqalize.com](https://voqalize.com/)) is a different product (voice layer). They feel premium **without selling “we have more features.”** Their line we keep: “The demos are running applications with readable brains, not separate product promises.”

Their loop (map 1:1 onto Prism):

| Voqalize | Prism (no cloud) |
|---|---|
| Voice = dense intent | Host chat = dense intent |
| Screen = typed truth (resolved / choice / missing) | Dashboard + MCP Apps + Envelope = typed truth |
| Approve is **their** button | Land / commit is **yours** (`job_control`, git) |
| “Brain remains yours” | Iris + the editor’s model stay on the machine |
| MCP creates the agent record and hands the agent **docs** | MCP orients + verbs; it is not a 51-tool catalog |

We do **not** copy voice, WebRTC, hosted speech, or a public `https://app…/mcp` against visitor disks.

### 4.5 Premium without cloud (craft, not hosting)

Today’s prismhq.in still feels like a **catalog**: Dispatch / Playground / Iris / Envelope / Prepare / Guard / Spectrum, dummy Pulse-Board-List, “41 MCP tools”, “8 surfaces.” Voqalize’s homepage is **one order desk** resolving in public. That gap is why they feel finished and we don’t.

Steal these eight. None of them need a cloud indexer.

1. **One sentence, one hero, one install line.**  
   “Agents guess. Prism shows the work, then you approve.” Homepage = `/demo` running. The only install CTA is `prism mcp add` (or the host equivalent in §4.4). **Product and features stay as their own lists** (`/products`, `/features`) — do not dump that catalog on the hero. Do not pretend they are three SKUs.

2. **The product in chat is a typed surface, not JSON.**  
   Voqalize’s premium is *visible state in the host*. Our `jobs-app.html` is a dark list + “Open dashboard.” Live Relay cards must look like their draft: listening → lines resolving → one open choice → Review. `repository_overview` should render a **scoreboard widget** (identity, health, `open[]`), not a blob. This is the highest-leverage MCP work in the program.

3. **Uncertainty is designed, not hidden.**  
   Their “2 variants / choose pack size” is the luxury. Ours: `open[]` as chips, inferred edges labeled, “not measured” ≠ 0, Guard flags without claiming the edit is correct. Never paper over a fork in prose.

4. **Restraint.**  
   They say they are *not* a voice treatment for every screen, and they publish a fit / not-fit list. We publish: ✓ agent already in the editor, repo on disk, reviewable before land. × not an LLM, not a hosted indexer, not a second IDE. Hero tools stay the verb list in §8.2.

5. **Honest status.**  
   They put “SDK still moving / calls run in India today” on a first-class status page. We need `/docs` **Current status**: local-only, Node 26, stdio MCP, `/demo` is a fixture, Live Relay ship-state. Dummy theaters labeled “Dummy” are the opposite of premium.

6. **Vocabulary budget.**  
   They define Brain / Agent (record) / Session / Action / Wire in one line each, and they *warn* when “agent” means two things. User-facing we keep: **Prism, Iris, Envelope, Jobs.** Pulse, Board, List, Playground, Dispatch-as-product, Spectrum, Repository Map, Domains leave the face.

7. **Envelope is our inspectable protocol.**  
   They sell “test the interaction, not just the prompt” and a versioned wire. We already have receipts (tool, bytes vs dump, truncated). Market that as the product, not a seventh card. An empty week is “no sessions,” never 0%.

8. **Motion in the demo.**  
   Their order “resolves on its own clock.” `/demo` must *do* a Prepare / blast / chip-expand on the fixture — not six static GSAP mocks. Recorded Jobs cards, not a spawn.

**Fit / not-fit (homepage, Voqalize shape):**

- ✓ The agent is already in Cursor / Claude / the TUI
- ✓ The question spans more than one file
- ✓ The tree is on this machine
- ✓ A mistake is cheap until you land
- × We are not the coding model
- × We do not index a visitor’s private repo in the browser

Install (§4.4) is what makes this feel *operated*. Craft above is what makes it feel *finished*.

### 4.2 Website IA (target)

| Route | Role |
|---|---|
| `/` | One hero: Prism Intelligence. Demo. **One install line.** Nav links to product + features lists — those lists are not the homepage. |
| `/demo/<fixture>` | Read-only Dashboard on a **named** canned repo (see §6), e.g. `/demo/prepare`. Primary publicity investment. |
| `/docs` | Only necessary pages (below). |
| `/install` | Keep. One line per host (§4.4). Not a remote `https://app…/mcp`. |
| `/products` | Keep as **the product list** (one product, named pieces: Iris, Envelope, Jobs, Dashboard…). Rewrite away from three SKUs. |
| `/features` | Keep as **the feature list** (Prepare, blast, Guard, DNA + Trees widget, Trends…). Not Domains. Not a map product. |
| `/security` `/privacy` | Keep. |
| `/whats-new` | Keep, shorter. |
| `/benchmarks` | Keep if the numbers still earn a page. |
| `/admin` | Keep internal or drop from public nav. |

Kill copy that says “Playground, Intelligence, and Dispatch — three surfaces.” Product ≠ three storefronts; features ≠ a second product.

### 4.4 Install — Voqalize-shaped URLs (locked 2026-09-19)

Public product host is **`https://app.prismate.io`**. Marketing site is `https://prismate.io`.

```bash
# MCP (HTTP, same shape as Voqalize)
claude mcp add --transport http prism https://app.prismate.io/mcp/

# CLI
curl -fsSL https://app.prismate.io/cli | bash
# or
npx -y @prismate/cli

# MCP package
npx -y @prismate/mcp

# IDE — Marketplace only, not npm
# landing: https://app.prismate.io/ide  → VS Code / Open VSX / Cursor
```

| Surface | URL / package |
|---|---|
| MCP HTTP | `https://app.prismate.io/mcp/` |
| CLI installer | `https://app.prismate.io/cli/` |
| IDE | Marketplace. Landing `https://app.prismate.io/ide`. **No `@prismate/ide` npm.** |
| Demo | `https://prismate.io/demo/<fixture>` |
| npm MCP | `@prismate/mcp` (was `mcp-server`) |
| npm CLI | `@prismate/cli` |

`prism mcp add` still writes host files for people who never open the app URL. Those files should point at the HTTP URL above when the app is up; stdio + `npx @prismate/mcp` remains the fallback for “I just opened a folder, no account.”

The hosted `/mcp` is the **product MCP URL**. It does **not** index a visitor’s private disk from the marketing site (`/demo` stays a fixture). Binding a local checkout is pairing with the local daemon / stdio, not an upload.

**Do not**

- Add Prism OAuth for third-party connectors (connectors stay on the host).
- Drop stdio — HTTP is the advertised install, not the only transport.
- Keep the package name `mcp-server`.

### 4.3 Public docs to keep (everything else stays in `plans/` as engineering SoT)

| Keep | Why |
|---|---|
| `docs/what-is-prism.md` | Rewrite to Prism Intelligence + Dashboard. |
| `docs/start/install.md` | MCP + CLI + IDE. |
| `docs/start/quickstart.md` | One loop: ask → Iris → prepare → (optional) job. |
| `docs/guides/understand-a-repo.md` | DNA / map / health. |
| A new `docs/guides/dashboard.md` | Rail = product. |
| A new `docs/guides/prepare-and-envelope.md` | Hero agent loop. |
| `docs/guides/dispatch.md` | Rename to **Jobs** (teammate). Shorter. |
| `docs/reference/mcp-tools.md` | Generated; mark hero vs advanced. |
| `docs/reference/cli-commands.md` | Generated; group by rail. |
| `docs/concepts/consent-and-privacy.md` | Required. |
| `docs/help/known-limitations.md` | Required. |
| `docs/help/faq.md` | Trim. |

| Move to `plans/` or delete from public nav | Why |
|---|---|
| Most of `docs/architecture/*` | Contributors read `plans/architecture/`. |
| `docs/concepts/graphs.md`, `dna-and-stack.md`, `repository-index.md`, `risk-bands.md`, `signal-provenance.md` | Fold a paragraph into what-is / limitations; full text is engineering. |
| `docs/start/playground.md` | Playground is not a product. |
| `docs/reference/mcp-prompts.md`, `ide-settings.md`, `configuration.md`, `capabilities.md` | Collapse into install + dashboard + FAQ. |
| `docs/help/troubleshooting.md` | Keep a short FAQ section instead. |

`docs:check` still generates MCP/CLI reference from source so copy cannot drift.

---

## 5. Package restructure (logic preserved)

### 5.1 Rule

**Merge packages. Do not merge algorithms.** Each current package becomes a **folder module** inside a fewer number of packages. Public `@repo-prism/core` method names stay. Tests move with the folders. No “rewrite intelligence in Core.”

ADR-0004 stays: surfaces call **Core** for analysis.  
ADR-0035 stays: **jobs runtime is not inside Core.** Dashboard and MCP may import the jobs package; Core must not.

### 5.2 Target tree

```text
Prism/
├── apps/
│   └── website/                 # marketing + docs + /demo
├── packages/
│   ├── shared/                  # contracts (unchanged role)
│   ├── engine/                  # NEW: all analysis internals
│   │   ├── analyzer/            # was packages/analyzer
│   │   ├── indexer/
│   │   ├── graph-engine/
│   │   ├── intelligence/        # DNA, health, prepare, findings, reports
│   │   ├── impact/
│   │   ├── navigation/
│   │   └── repository-map/
│   ├── core/                    # public SDK — wires engine, same API
│   ├── jobs/                    # was dispatch (rename when copy is ready)
│   ├── dashboard/               # ONE UI package
│   │   ├── primitives/          # was ui tokens/components
│   │   ├── screens/             # was app-shell + hub views + playground
│   │   └── daemon/              # was dispatch-hub server
│   ├── surfaces/                # MCP + CLI + host-session
│   │   ├── mcp/
│   │   ├── cli/
│   │   └── host/                # host-session
│   ├── ide/                     # vscode + cursor overlay
│   ├── plugin/                  # skill pack (optional keep)
│   └── test-support/
├── docs/                        # trimmed public docs
└── plans/                       # engineering SoT (unchanged role)
```

Published npm (scope **`@prismate`**, owner 2026-09-19):

| Package | Role | User installs? |
|---|---|---|
| `@prismate/mcp` | MCP server (was `mcp-server`) | Yes — `npx` / HTTP app |
| `@prismate/cli` | `prism` binary | Yes — `/cli` installer |
| `@prismate/core` | Public analysis SDK | Yes — embedders only |

Everything else is **workspace-private** (not on the public registry): `shared`, `engine`, `dashboard`, `jobs`, `plugin`, `test-support`. One major of `@repo-prism/mcp-server` → `@prismate/mcp` (and the other old names) as shims.

**Owner grab today (not code):** register `prismate.io`, create GitHub org `prismate`, create npm org `prismate`. Do not leave those three sitting unclaimed.

### 5.3 What we explicitly do **not** combine

| Do not | Why |
|---|---|
| Put indexer/SQLite inside MCP | Surfaces stay thin; first Intelligence call still indexes via Core. |
| Put jobs inside Core | Secrets, workers, and write-state must not sit next to the analysis SDK. |
| Put website in `packages/dashboard` | Public Next app ≠ local daemon. `/demo` **imports** dashboard screens. |
| One giant `src/` with no folders | You would lose the mental model that makes prepare/blast reviewable. |

### 5.4 Merge order (mechanical)

1. Create `packages/engine` with project references; move one engine per milestone **or** move all folders in one milestone with re-export shims from old package names (preferred: one milestone, shims, then delete shims).
2. Point `core` at `engine`.
3. Create `packages/dashboard`; move `ui` primitives, `app-shell` screens, hub dashboard, playground screens. Daemon stays the hub entry.
4. Create `packages/surfaces`; move mcp-server, cli, host-session. Bins unchanged.
5. Merge cursor-extension into ide packaging overlay (already the intent of ADR-0020).
6. Delete empty old packages and update moon/workspace/`docs:check`.

Each step must leave `bun run verify:milestone` green and published API intact.

---

## 6. Public `/demo/<fixture>` (Voqalize-shaped)

### 6.1 What it is

A **running read-only Prism Dashboard** on a fixture repository (e.g. a trimmed `m070-envelope` + a small app, or a snapshot of this repo’s public shape). Visitor can:

1. Open Overview (health strip + activity). No map.
2. Open Iris and see Envelope numbers + a canned Prepare run. DNA may show a recorded Trees widget (primary checkout).
3. Open **Impact & Guard**, pick a file from the tree (today’s map file list), run Open / See impact / blast (precomputed snapshot for v1).
4. See a Jobs tab with **recorded** job cards (not spawn).

v1 recommendation: **precomputed Iris snapshot** in the website build (JSON). Honest caption: “This is a real Prism index of a public fixture, frozen in the build.” That is still more true than three GSAP theaters. No live map.

v2 (optional later): WASM/core in a worker indexing a *provided zip* in the browser — high cost, not in the first demo milestone.

### 6.2 What it is not

- Not a hosted Prism of the visitor’s private repo.
- Not a live teammate.
- Not a second map implementation.

### 6.3 Publicity loop (homepage)

```text
Problem: agents guess; files don’t tell you blast or reuse.
  → Demo: click Prepare / Envelope / blast on the fixture.
  → Install: one MCP snippet.
  → Stay local: nothing uploaded.
```

Homepage CTAs: **Open the demo** + the **one install line**. Product and features are nav, not a second hero.

---

## 7. Copy and naming (user-facing vs engineering)

| User-facing | Engineering (keep until a rename milestone) |
|---|---|
| Prism / Prism Intelligence | Domain `prismate.io`. GitHub `github.com/prismate`. npm `@prismate/*`. Repo can stay `prism`. |
| Dashboard | dispatch-hub, Console, playground |
| Iris | Core index + graphs |
| Envelope | envelope ledger |
| Prepare | `prepare_change` |
| Jobs / teammate | Dispatch |
| *(no Spectrum / map product)* | `getRepositoryMap` stays in Core; `RepositoryMapView` unmounted. File actions → Impact & Guard |
| Impact & Guard | `@repo-prism/impact`, `guard_session` |

Do not rename MCP tools or Core methods in this program. Do not personify Iris.

---

## 8. Jobs — Live Relay (chosen)

> **Superseded (2026-10-06, ADR-0058 Accepted).** Prism stops running agents; Live Relay is frozen and the old M-079 is replaced by *Safety layer + Lenses*. See [`M-079_safety-layer.md`](./M-079_safety-layer.md). This section is kept as history.

Owner decision 2026-09-19. Stitch reference: [Prism MCP — Jobs in TUI & agentic chat](https://stitch.withgoogle.com/projects/4762229733476728219) (Option 3 screens).

**Chosen:** Live Relay. The detached worker stays (checkout / worktree, no shell, Prism verifies and lands). This host conversation is the live view and the steer. No “Watch live at Console.”

### What ships as the product

| Host | What Prism MCP shows |
|---|---|
| TUI (Claude Code) | `start_job` then a live box in **this** transcript. Next line can be `job_control` steer. Prompt mode: Steer job / talk. Keys for waiting-on-you. |
| Agentic chat (Cursor / Claude / ChatGPT) | Tool chip + MCP App **in this thread**: LIVE card, thinking collapsed, files, question buttons, Pause/Stop. Composer: Steer job vs Talk to agent. |

Same tools, two renderings. No second session. No embedded editor.

### Keep

Prepare injection, dirty confirm, checkout vs worktree, Prism verify/commit, stall clock, findings → a run, no jobs in Core, no Prism OAuth.

### Kill as the primary loop

“Watch live at :17330”, Pulse/Board/List as the place you watch work, mute `add context` instead of a reply, “teammate or here?” as the default beat.

### Dashboard Jobs — keep, but slim

Live Relay in TUI + editor **is** the cockpit. Do not build a second Pulse/Board here.

**Keep the Jobs tab.** TUI transcripts scroll away; a closed chat cannot land a worktree, show verify, or hold a findings backlog.

**Strip live action items from the Dashboard row** (today’s `JobActions` on Pulse/Board). Pause, Cancel, Resume, Add instruction, dirty-confirm “Start anyway”, Retry stay in **TUI / editor** via `job_control`. Dashboard keeps view / diffs / verify readout / land (Keep all) / Findings / export logs / delete-from-board.

Token spend chart moves to **Trends** (Pulse block).

Notifications still page an idle chat (ADR-0043). `/demo` Jobs stay recorded cards, not a live teammate.

### On hold (not rejected)

| Option | Why parked |
|---|---|
| **2** Second chat / second TUI session | Better for a long messy 1:1. Revisit if Live Relay floods this thread. |
| **4** Editor is the cockpit | Truth is the diff; MCP still cannot host a buffer. Revisit as a **handoff** from the relay card (`Open in editor`), not as the default loop. |
| **6** Supervisor + named run cards | Better for two parallel jobs in one chat. Revisit if Live Relay forbids a second stream and we need parallelism without a second conversation. |

Do not implement 2, 4, or 6 unless the owner unparks one. A later `Open in editor` affordance on the Live Relay card is allowed; that is not Option 4 as the product.

---

## 8.1 Sanitize — drop what this product does not sell

Owner ask 2026-09-19, amended same day: **Domains is gone as a feature** (tab, chips, theater, taught domain reports). **Repository Map is gone as a product** — a map that only shows the map is not a use case; unmount `RepositoryMapView`. File tree + Open / See impact / Bookmark move to **Impact & Guard**. Console **Trees** (checkout + linked worktrees) becomes a **widget on DNA Analysis**, not its own rail. **Integrations** keeps MCP Server, CLI, Extensions only. MCP should stop advertising the same sprawl. **Cut the face, not the engine.** `getRepositoryMap` and stack-domain detection stay in Core, untaught.

### A. Dashboard / Spectrum UI — remove as destinations

| Cut | Today | After |
|---|---|---|
| **Domains** (the whole feature) | Nav, “Explore Domains”, per-domain screens, DNA/Overview chips | **Gone.** No chips, no theater, no taught `backend`/`frontend` expansions. Health strip testing/security headlines stay (they are health factors). `#/domains` `#/domain` → DNA |
| **Repository Map** (the whole UI) | Spectrum product; file-zoom tree + sheet (Open / See impact / Bookmark) | **Unmounted.** File tree + Open / See impact / Bookmark on **Impact & Guard**. `#/map` → Overview. No widget on Overview / DNA / Impact |
| **Testing & Security** tab | Own screen | Overview health strip; deep dive = `repository_health` / Impact |
| **Guard** as a sibling nav | Separate from Impact | One **Impact & Guard** |
| **Dispatch** “open in new tab” | Second app | **Jobs** on this rail |
| **Pulse / Board / List** | Three Console products | Live Pulse/Board/List die. Token chart → **Trends**. Job history + Findings action → **Jobs** tab. Pause/Cancel/Resume/steer/retry leave the Dashboard row |
| **Trees** as a Console rail item | Own page: primary checkout + linked git worktrees, dirty, jobs, open/merge/drop | **Widget on DNA Analysis** (`TreesView` reused, scoped to the selected workspace). Job compose / land still deep-link to Jobs. `#/trees` → DNA |
| Playground as a product name | Third app | Absorbed (§2) |
| Integrations extras | Remote Git, GitHub Actions, PageSpeed / CWV, GitHub App / forge, Argo, Jenkins, host-connectors list | **MCP Server, CLI, VS Code, Cursor** only |
| `/products` as three SKUs | Website theater | One product list + one features list (§4.2). Same install line. |

Redirects: `#/domains`, `#/domain`, `#/trees` → DNA. `#/map` → Overview. `#/testing` → Overview health strip. `#/guard` → Impact & Guard. Deep-link with a file/path → Impact & Guard with that target.

### B. MCP — hero vs hide vs later delete

51 tools stay **registered** until a dedicated drop (do not break agents mid-major). Instructions and docs stop teaching the cut list.

**Hero (teach these):**  
`repository_overview` (orient — §8.2) · `prepare_change` · `blast_radius` · `review_changes` · `guard_session` · `find_symbol` · `list_findings` · `start_job` · `list_jobs` · `job_control` · `start_my_day` · `workspace_status`

**Hide from instructions (still callable one major):** these are the Domains/Spectrum leftover and thin wrappers.

| Tool | Why it is not the product now |
|---|---|
| `backend_report` | Domains feature — dropped. |
| `testing_report` | Same. |
| `security_report` | Same. |
| `repository_map` | Map UI dropped; file actions are Impact verbs. |
| `feature_graph` | `list_features` / DNA is enough for agents. |
| `knowledge_graph` | `dependency_graph` is the load-bearing graph. |
| `explore_code` | Overlaps `explain_area`. Keep `explain_area`. |
| `work_order` | Slice of `prepare_change`. |
| `changed_paths` | Slice of `review_changes`. |
| `breaking_change_hints` | Already on `review_changes`. |
| `engineering_health` | Deep view; start with `repository_health`. |
| `health_history` | Trends; `repository_health` / DNA history later. |
| `landmarks` · `stack_profile` · `list_packages` | Fold into DNA / overview unless asked. |
| `search_symbols` | Advanced; `find_symbol` is the hero. |
| `queue_finding` | Wrapper on `start_job`. Keep for Findings **Fix**, do not list in the hero. |
| `capabilities` | Agent diagnostic, not a user feature. |

**Keep as real (not hero, not cut):**  
`find_references` · `dependency_route` · `dependency_cycles` · `safe_delete` · `rename_impact` · `test_impact` · `agents_md` · `remember` · `working_set` · `use_skill` · `init` · `sleep` · `wake` · `configure` · `dispatch_doctor` · `job_logs` · `explain_area` · `dependency_graph` · `list_features`

**Never delete in this program:** Envelope, Prepare, impact graphs, Core stack-domain detection, `getRepositoryMap`. They stay untaught until a later drop.

### C. Copy

Kill “Playground, Intelligence, and Dispatch”, “Explore Domains”, “Repository Map” / Spectrum as a product, “Testing & Security” as a product, “Open Dispatch”, Pulse/Board/List as names. Website and `docs/` follow §4.

---

## 8.2 Compose Intelligence — screens for humans, one orient for agents

Mirroring the rail as three MCP tools (`overview` + `dna` + `health`) is the old bug with nicer names. Every tab became a tool; three composers would just become three dumps.

**Better split:** humans get three *screens*. Agents get **one thin orientation** plus Envelope-style **expansions**. Verbs stay tools. Engines stay behind the composers.

```text
HUMAN (Dashboard)
  Overview  = health strip, activity (no map, no domain chips)
  DNA       = identity catalog: stack, packages, landmarks, features + Trees widget
  Trends    = history + engineering movers + Pulse token chart

AGENT (MCP)
  repository_overview   ← one default read (scoreboard, not a dump)
       │
       └─ expand: listed on the scoreboard with why + cost
            identity | packages | landmarks | features
            health | history | engineering

  verbs (unchanged): prepare_change · blast_radius · review_changes
                     guard_session · find_symbol · start_job …
```

### Why this is better than three composers

| Three composers (previous §8.2) | One orient + expand |
|---|---|
| Agent must pick overview *or* dna *or* health | One first call |
| `section=` is `backend_report` renamed | Scoreboard stays identity + health; domain reports are untaught |
| Default DNA with packages+landmarks+features is a dump | Default stays Envelope-small |
| Trends as a taught tool | Agents ask “worse?” → expand `history`, not a third hero |

Keep **three human screens**. Do not merge DNA into Overview — “what is this” and “what’s going on now” are different rooms. Do not teach three MCP names for those rooms.

### Default orientation payload (always cheap)

What `repository_overview` returns on first call — the same facts Overview shows above the fold:

- Identity line (languages / package manager) from `getDna` — not a Domains product
- Health score + 3–5 factor headlines (testing/security as **headlines**, not domain reports)
- A few landmarks (bounded)
- Coupling / activity already on today’s overview
- `open[]`: named expansions the agent is allowed to take, each with why + a size hint

No domain chips. No map payload. No full backend report. No feature graph. No health history series. That is what Envelope already taught us.

### Expansions (same Core methods, not new products)

| Expand | Calls | Human equivalent |
|---|---|---|
| `identity` | rest of `getDna` + stack | DNA page |
| `packages` · `landmarks` · `features` | list* | DNA sections |
| `health` | full `getHealth` factors | Overview health drill-in |
| `history` | `getHealthHistory` | Trends |
| `engineering` | `getEngineeringHealth` | Trends movers |

Do **not** teach `backend` / `frontend` / `testing` / `security` / `map` expansions. Those Core methods stay callable one major; they are not the product.

The first response **lists** which of the taught expansions are worth it. The agent does not guess `section=`.

`repository_dna` and `repository_health` stay as **shims** for one major (`dna` = overview + expand identity; `health` = expand health/history/engineering). Instructions name only `repository_overview` for nouns.

### Agent loop

1. First Intelligence call → `repository_overview`. Read `open[]`. Expand at most what the question needs.
2. Before edit → `prepare_change` → `blast_radius`.
3. Review / land → `review_changes` · `guard_session`.
4. Change code → Live Relay.

Do not call `backend_report` / `repository_map` / `landmarks` / `health_history` unless the user asked, and do not teach those names.

### Dashboard / CLI

- Overview, DNA, Trends are **views over the same composer**. DNA is expand `identity`+catalog. Trends is expand `history`+`engineering`.
- CLI: `prism overview` (default scoreboard). `prism overview --expand identity|packages|health|history`. `prism dna` / `prism trends` are aliases for the same expand sets.
- Hidden old commands (`backend`, `map`, …) shim one release.

### What we do not do

- One mega-tool with forty optional fields and a fat default.
- Three taught composers that 1:1 copy the rail.
- Flatten engine folders (§5).
- Keep PageSpeed / Lighthouse / GitHub CI on Integrations. Those cards are out for now.

---

## 9. Milestone sequence

One `In Progress` at a time. **Hard gate:** after M-077 is Verified, land `fix/mcp-console-dashboard-sanity` onto `main` before opening M-078. Do not park that branch.

Every row below follows **§9.1 Verification ritual** (same process as M-001–M-076).

| ID | Name | In scope | Out of scope | DoD |
|---|---|---|---|---|
| **M-077** | Product contract | Accept ADR-0057; this file **Approved**; Master Plan §3 rewritten to one product; `PROGRESS` one In Progress | Product code; Live Relay | Owner approves ADR + this program; `verify:milestone` |
| — | **Land sanity** | Merge `fix/mcp-console-dashboard-sanity` to `main`; `verify:milestone` green on that merge | Starting M-078 before it lands | Sanity is on `main` |
| **M-078** | Dashboard shell | New rail; **unmount** `RepositoryMapView`; **drop Domains**; map file options → Impact & Guard; Trees widget on DNA; Pulse **token chart** → Trends; Jobs = history/land + **Findings** action; **strip** Pause/Cancel/Resume/steer/retry from Dashboard job rows; Integrations = MCP + CLI + Extensions; unhook Testing / Guard-sibling / Dispatch-tab; redirects; **one design system** (`packages/ui`); Prism tools before each file | Live Relay; delete Core domain detection or `getRepositoryMap`; changing the locked tagline | One nav; no map/Domains; Trees on DNA; token chart on Trends; Jobs has no live controls; Integrations four cards; no new private primitives |
| **M-079** | Jobs Live Relay | Isolated worker streamed + steered in this host chat (TUI + MCP App). Dashboard Jobs stays slim archive + Findings action | Options 2 / 4 / 6; Pulse/Board as cockpit | TUI + chat: start → live card → steer → verify, no Console URL |
| **M-080** | Agent + CLI IA | Instructions: one orient + expansions (§8.2); loopback Streamable HTTP `/mcp` on the daemon; `prism mcp add` writes host configs; CLI `overview --expand`; teach the advertised `app.` URL | Delete tool registrations; public DNS/org cutover (M-086); pairing gateway if not ready | First-call scoreboard with `open[]`; one command adds Prism (loopback HTTP works) |
| **M-081** | Marketplace publisher | Rename publisher `prismhq.repo-prism` → `prismate` (VS Code Marketplace + Open VSX + Cursor). Update VSIX ids, publish CI, `/ide` copy | npm `@prismate/ide`; website rewrite | Extension installs under the new publisher |
| **M-082** | One Dashboard package | Move app-shell + hub UI + playground screens into `packages/dashboard`; IDE webview and hub serve the same entry | Engine merge | Playground app can be a thin Vite host or deleted |
| **M-083** | Engine package merge | `packages/engine` folders + shims from old names | Algorithm changes | All engine tests pass via new paths |
| **M-084** | Surfaces + IDE merge | `packages/surfaces`, `packages/ide`; bins unchanged | Tool rename; public org remotes (M-086) | Published `cli` / `mcp` still start; IDE is VSIX |
| **M-085** | Docs trim | Public nav = keep list in implementation §3 / program §4.3; architecture pages unlinked or redirected | Delete `plans/` | `docs:check` + `docs:build` |
| **M-086** | Website + `/demo` + identity cutover | Homepage + `prismate.io/demo/<fixture>`; **how-to** for domain, `app.` subdomain, GitHub org, npm org (implementation §4.8); pairing gateway on `/mcp`; `prismhq.in` 301 | Browser live-index of user code; invent the fixture name (owner names it) | Public hosts resolve; install lines work; demo click-path Overview → Iris → Impact |

M-058 / M-059 (bounded tools, reference precision) remain **quality of Iris**, not sprawl. Schedule them **beside** this program, not instead of it.

**Open (owner later, do not invent):** which public repo is the `/demo/<fixture>` canned index; whether `/demo` v1 stays a precomputed snapshot (recommended) or a live browser index.

### 9.1 Verification ritual (every Intelligence milestone)

Same process as every earlier phase (Master Plan §8.1, §9, §10). This program does **not** skip gates because a milestone is “just docs” or “just a rename.”

```text
Create milestone/M-XXX-short-name from latest main
↓
Develop on that branch only (working tree — NO commits yet)
↓
bun run verify:milestone   (typecheck, lint/format, unit, integration, build, plan-progress)
↓
Fix until green
↓
Manual checklist in that milestone doc
↓
Owner review
↓
Owner Approves → then create commit(s) on the milestone branch
↓
Owner Approves merge
↓
Merge to main (LOCAL ONLY — no push unless asked)
↓
Mark milestone Verified in PROGRESS.md; check DoD boxes
↓
Share short “what changed” snippet (APIs / packages / ADRs / plan notes)
↓
Create NEXT milestone branch from updated main
↓
Repeat
```

Hard rules unchanged: never develop on `main`; never stack milestone branches; never commit until the owner says so; `verify:milestone` before every review; main stays buildable after every merge.

---

## 10. Risk and non-goals

| Risk | Mitigation |
|---|---|
| Merge breaks publish | Shims + `check-publish-exports` + one major of aliases |
| Dashboard merge regresses Console | Same CSS tokens; visual DoD is rail + routes, not a restyle |
| Demo looks fake | Caption the fixture; use real `prepare_change` / Envelope JSON from a recorded run |
| “Intelligence software” read as LLM | Copy: no model in Core; agent stays in the editor |
| Scope explosion with Jobs | Live Relay only. 2 / 4 / 6 stay on hold. Dashboard Jobs is not the cockpit. |

**Non-goals:** cloud sync, paid SKUs, renaming Iris/Core, cutting `prepare_change` / Envelope / blast, Tree-sitter, new language support.

---

## 11. Owner checkpoints

1. ~~Approve this program + ADR-0057~~ **Done 2026-09-19.**
2. `/demo` v1 snapshot vs live browser index — **discuss later** (do not lock in this pass).
3. ~~Confirm public npm names stay `cli` + `mcp-server`~~ **Locked:** scope `@prismate`; bins `prism` / `prism-mcp`. `@repo-prism/*` shims one major.
4. Jobs interaction is **Live Relay** (§8). Scheduled as **M-079** (immediately after the Dashboard shell). Options 2 / 4 / 6 stay on hold.
5. M-077 is **In Progress** on `milestone/M-077-prism-2.0`. Sanity is already on local `main`. After M-077 Verifies, say **go ahead with M-078**.
6. Which public repo is the `/demo/<fixture>` canned index — **owner will name later**. Do not invent a fixture in the plan.
7. Marketplace publisher rename is **M-081** (after M-080).

No product code until M-077 is Verified, sanity is on `main`, and M-078 opens from that `main`.
