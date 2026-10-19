# ADR-0057: Prism Intelligence is one product, one Dashboard, fewer packages

| | |
|---|---|
| Status | **Accepted** |
| Date | 2026-09-18 |
| Accepted | 2026-09-19 (owner) |
| Milestone | Program [`PROGRAM_prism-2.0.md`](../archive/milestones/PROGRAM_prism-2.0.md) (M-077+) |
| Amends | [ADR-0004](./0004-core-only-integration-surface.md), [ADR-0035](./0035-dispatch-vertical.md), [ADR-0048](./0048-prism-console-unification.md), [ADR-0052](./0052-product-identity-and-iris.md), [ADR-0053](./0053-console-information-architecture.md) |
| Does not | Reopen Q-009 / Q-010; rename MCP tools; rewrite engine algorithms |

## Context

Prism is sold as several products (Intelligence, Dispatch, Spectrum / Playground) across several hosts (Console, IDE webview, playground, website theaters) and ~20 workspace packages. The durable advantage is analysis for agents — Envelope, Prepare, graphs, impact — not a fleet OS and not a second map app.

The owner has chosen to streamline: **one Prism Intelligence product**, **one Dashboard**, **trimmed docs/website**, a **public demo** in the Voqalize sense (a running application, not three SKUs), and **fewer packages** without losing the intelligence implementation. Repository Map is removed from the product (a map that only shows the map is not a use case); its file options move to Impact & Guard. The Domains feature is dropped completely. Integrations is MCP + CLI + Extensions only.

ADR-0048 already unified two loopback UIs into one daemon. This ADR finishes that idea: Dispatch is **not a product** (it is the job runtime). Spectrum / Repository Map is **not a product and not a widget**.

## Decision

### 1. One product name in user-facing copy

User-facing product: **Prismate**. Teammate name in copy: **Prism**. Hero copy is locked in PROGRAM §0.1 (Q-027).

Public identity (owner 2026-09-19, relocked same day from prismintelligence.io): **`prismate.io`**, GitHub org **`prismate`**, npm **`@prismate`**. `prismhq.in` and `@repo-prism` are shims for one major.

- **Dispatch** is not a product. It is the job runtime. UI: **Jobs**. Speech: teammate.
- **Spectrum / Repository Map** is not a product. Unmount the map UI. File-zoom tree and sheet actions (Open / See impact / Bookmark) live on **Impact & Guard**.
- **Domains** is not a feature. No tab, chips, or theater.
- **Iris** stays the accumulated knowledge (ADR-0052). Console `#/iris` stays the aperture (Envelope + Prepare + index), not a second app.
- **Trees** (Dispatch Console checkout + worktrees) is not a rail item. It is a widget on **DNA Analysis**.

Engineering package names may lag copy until merge milestones.

### 2. One Dashboard, three hosts

There is a single Dashboard information architecture:

Overview · Iris · Jobs · Skills · DNA Analysis · Trends · Impact & Guard · Integrations · Settings

Hosts:

1. Local daemon (today `:17330`)
2. IDE webview (same bundle, `host-session`)
3. Website `https://prismate.io/demo/<fixture>` (read-only, named snapshot)

`apps/playground` is not a product; its screens move into the Dashboard package.

Settings are **combined** (today’s Dispatch + Spectrum/app-shell prefs).

Jobs **interaction** is **Live Relay** (program §8, owner 2026-09-19): isolated worker, this host chat (TUI + editor) is the glass and the steer. Dashboard `#/jobs` stays as history / verify / land plus **Findings** as an action — **no Pause / Cancel / Resume / steer / retry** on that tab. Token spend chart lives on **Trends**. Second-chat, editor-cockpit, and supervisor-cards stay **on hold**.

**Sanitize + compose** (program §8.1–8.2): Domains (the whole feature), Repository Map UI, Testing tab leave the face. Console Trees is a **widget on DNA**. Pulse token chart lives on **Trends**. Findings is an action on slim **Jobs**, not its own rail. Integrations shows MCP Server, CLI, VS Code, Cursor only. Humans keep Overview, DNA, Trends as screens. File options that today sit on the Repository Map sheet move to Impact & Guard. Agents get **one** orientation (`repository_overview`) plus Envelope-style expansions — not three MCP composers, not domain reports, not a map expand. Specialist reports stay in Core, untaught. Old tool names shim for one major.

### 3. Surfaces share the same IA

MCP instructions and CLI help are grouped like the rail. Analysis still goes through `@repo-prism/core` only (ADR-0004). Jobs still do not go through Core (ADR-0035).

### 4. Packages collapse to modules, not to a rewrite

Published npm: `@prismate/mcp` (not `mcp-server`), `@prismate/cli`, `@prismate/core`. **No IDE npm** — Marketplace only. Domain **`prismate.io`**. Demo **`https://prismate.io/demo/<fixture>`**. App **`https://app.prismate.io`** (`/mcp`, `/cli`, `/ide` landing → Marketplace). GitHub org **`prismate`**.

Internals collapse toward:

- `engine` — analyzer, indexer, graph-engine, intelligence, impact, navigation, repository-map (as folders)
- `jobs` — today’s dispatch
- `dashboard` — ui primitives + app-shell + hub UI + daemon
- `surfaces` — mcp + cli + host-session
- `ide` — vscode + cursor overlay
- `shared` — unchanged role

**Forbidden:** moving job workers into Core; moving indexer into MCP; flattening engine folders into one undifferentiated `src/`.

Old package names may re-export for one major.

### 5. Website is one product plus a real demo

Homepage sells Prism Intelligence: running `/demo` + **one install line**. `/products` and `/features` stay as **separate lists** (one product, many features) — not three SKUs and not the homepage catalog. `/demo` is a running read-only Dashboard on a **precomputed fixture index** (v1). It must not accept or upload a visitor’s repository.

Public `docs/` shrinks to start, product loop, Dashboard, Jobs, MCP/CLI reference, privacy, limitations. Architecture long-form stays in `plans/`.

### 6. Naming budget (ADR-0052) still holds

> **Amended by [ADR-0058](./0058-prism-does-not-run-agents.md) and [ADR-0059](./0059-lenses.md) (2026-10-06).** Jobs leaves the user-facing vocabulary; **Lenses** takes its slot. Budget: Prism, Iris, Envelope, Lenses.

Iris remains the only extra name. Spectrum / Repository Map / Domains leave the user-facing vocabulary. File options live on Impact & Guard. No new product nouns (no “Prism OS”, no worker persona).

### 7. Install is Voqalize-shaped on `app.prismate.io`

Owner 2026-09-19: the advertised add is HTTP.

```bash
claude mcp add --transport http prism https://app.prismate.io/mcp/
```

CLI: `https://app.prismate.io/cli/`. IDE: `https://app.prismate.io/ide`. npm MCP package: `@prismate/mcp`. stdio + `npx @prismate/mcp` stays as fallback. The public `/mcp` must not ingest a visitor’s private tree; `/demo` stays a fixture. No Prism OAuth.

## Consequences

- Positive: one storefront; agents and humans see the same structure; fewer publish/docs contradictions; playground/Console/IDE stop diverging.
- Negative: large mechanical moves (moon, exports, docs:check); one release of shims; `/demo` v1 is a snapshot, not live visitor indexing.
- Follow-ups: accept this ADR + program; Live Relay is **M-079** (after the Dashboard shell); Marketplace publisher rename is **M-081**; demo + identity cutover is **M-086**; sanitize with the Dashboard shell and MCP instructions; Options 2 / 4 / 6 remain parked. HTTP MCP pairing is the suggested gateway in implementation §4.7 (not an indexer).

## Alternatives rejected

**Keep the map as a look-don’t-act widget.** Rejected: if the only use case is showing the map, remove it.

**Keep Domains as chips on DNA.** Rejected: the Domains feature is dropped completely (face only; Core detection stays).

**Keep GitHub / PageSpeed / host-connectors on Integrations.** Rejected for now: that page is how you install Prism (MCP, CLI, Extensions).

**Keep three products, only hide them in the MCP list.** Rejected: the website and Console still teach the wrong shape.

**Merge jobs into Core.** Rejected: ADR-0035; workers and write-state must not sit in the analysis SDK.

**Rewrite intelligence while merging.** Rejected: the point of the merge is to keep the implementation.

**Live-index the visitor’s repo in `/demo`.** Rejected for v1: privacy and size. Snapshot of a public fixture is honest.

**Hosted HTTP MCP that indexes a visitor’s private disk.** Still rejected. The advertised URL `https://app.prismate.io/mcp/` is the product install shape (Voqalize). It does not ingest an anonymous visitor’s checkout.

## Compliance

- [x] Owner accepts this ADR (2026-09-19)
- [x] Master Plan §3 updated in M-077
- [x] `PROGRAM_prism-2.0.md` marked Approved
