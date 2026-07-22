# Prism UI specs (UXPilot HTML handoff)

| Field | Value |
|---|---|
| Status | **Option B (pixel-close dark) — implemented in M-042** |
| Decision | Owner chose Option B 2026-07-22; product UI relocked to UXPilot dark ([ADR-0014](../../adr/0014-uxpilot-dark-product-ui.md)) |
| Owner overrides | Keep left KPI sidebar + edge graph; blast rings on **selected** node only |
| Archives | [`html/01-repository-map.html`](./html/01-repository-map.html) · [`html/02-dashboard.html`](./html/02-dashboard.html) · [`html/03-landing.html`](./html/03-landing.html) |
| Brand SoT | Live tokens `packages/ui/src/tokens.css` (dark) · [ADR-0014](../../adr/0014-uxpilot-dark-product-ui.md) |
| Product SoT | [`../../PRD.md`](../../PRD.md) · [`../../UX_SIMPLICITY.md`](../../UX_SIMPLICITY.md) |

> **Product UI = UXPilot dark.** These HTML files are the visual reference for the
> dark theme now live in `@prism/ui` (navy, cyan `#00C2C2`, violet `#6C63FF`,
> Inter + JetBrains Mono). Build against the `--prism-*` tokens in `tokens.css`;
> do not paste raw Tailwind HTML into components. Landing (`03-landing.html`)
> remains deferred to the marketing/docs site.

---

## Conflict table (UXPilot → Prism resolution)

| UXPilot choice | Locked Prism rule | Resolution for implement |
|---|---|---|
| Dark navy `#0A0E1A` default | Light Signal Chart | Keep light canvas/panel; optional dark **IDE chrome only** later |
| Accent cyan `#00C2C2` + violet `#6C63FF` | Brand teal `#0F766E` only | Remap all accents → `#0F766E` / `#115E59`; risk amber `#D97706` only on impact / blast |
| Inter + JetBrains Mono | Satoshi + IBM Plex Mono | Swap fonts |
| Diamond SVG logo | Locked faceted P mark | Use `plans/mockups/logo/exports/prism-mark-teal-*.png` |
| **Left Map sidebar** (stats, regions, layers, recent) | Earlier: drop for ≤3 top actions | **Owner keep** — Map shell includes left KPI / regions sidebar |
| KPI Overview dashboard as home | Map is hero | Map = default; Overview dashboard screen = secondary (not Map home) |
| Multi-layer checkboxes always on | One View at a time | Prefer **Views** menu; sidebar layer toggles OK if they map 1:1 to views |
| **Graph edges (dense)** | Earlier: ≤2–3 routes | **Owner keep** — render dependency edges on the Map canvas (edge graph) |
| Blast rings on Map | Blast is its own job | **Rings only when a node is selected** (selection affordance); full Blast screen still via See impact |
| Share / Sync / avatars / SaaS GitHub OAuth | Local-first, offline | Use Reindex + offline status; no cloud Share as primary |
| Marketing landing (OAuth, Slack, SaaS) | Local-first product | Landing deferred (Vercel later); rewrite copy to local/offline |

---

## Screen index

| ID | Archive | Job | Implement where | Priority | Milestone |
|---|---|---|---|---|---|
| A | `html/01-repository-map.html` | Orient & go | `@prism/ui` + playground | P0 | M-042 |
| B | `html/02-dashboard.html` | Pain / health overview | Separate Overview / inspector panels | P1 | M-042 / M-015+ |
| C | `html/03-landing.html` | Marketing site | Future `apps/docs` or Vercel site | P3 | M-038+ |

---

## A — Repository Map (primary)

### Keep (IA / UX)

- **Left sidebar** — repo stats (nodes/edges/regions/health), feature region list + counts, layer/view toggles, quiet recent changes (local signals; no SaaS avatars required)  
- **Center canvas** — feature regions + **dependency edge graph** (spaghetti / full edge set OK)  
- **Right inspector** — selection identity → tags → metrics → deps → ownership  
- **Search** in chrome (“Find a feature or file…” / ⌘K later)  
- **Blast rings** — show pulse / impact preview rings **only for the selected node** (and optionally its highlighted blast edges); clear on deselect  
- Zoom / fit / pan controls near canvas  
- Inspector CTAs: **Open** (filled `#0F766E`) · **See impact** (outline) → full Blast experience  

### Drop or defer

- Dark theme / cyan / violet brand colors  
- Primary top-bar CTA “Blast Radius” as always-on mode (selection rings + See impact instead)  
- Cloud Share / avatar chrome as primary  
- Violet/rose/amber region rainbow as brand (regions may use soft teal scale + labels; risk amber only for blast)  

### Rematerialize into Signal Chart shell

```text
TOP 56px:   [faceted P] Prism | Search…………… | Views | Reindex | offline
LEFT ~224:  Repository stats · Feature regions · Layers/Views · Recent
MAIN:       Region blobs + nodes + dependency edges
            (blast rings / blast edges when node selected)
RIGHT ~288: Inspector — selection · Open · See impact
```

### Acceptance (agents)

- [ ] Light theme tokens from `tokens.css`  
- [ ] Left KPI / regions sidebar present on Map  
- [ ] Dependency edges rendered on canvas (dense graph allowed)  
- [ ] Blast rings (and optional blast-styled edges) only while a node is selected  
- [ ] Selection unlocks inspector; Open / See impact  
- [ ] Matches playground job: orient & go  

---

## B — Dashboard / Overview (secondary)

### Keep (IA)

- Health score summary (0–100 + factors) — Core `getHealth`  
- Region health list (feature → score)  
- Blast risk list as a **queue** once M-020 exists  
- Quiet activity / recent changes (local index events — not cloud avatars)

### Drop

- Dashboard-as-home replacing the Map  
- Plotly marketing charts as product centerpiece  

### Rematerialize

| UXPilot block | Prism home |
|---|---|
| Health ring / score | Left sidebar stats + inspector Health / Views → Health |
| Codebase DNA bars | DNA panel (M-013/014 data); light cards, teal fills |
| Region health table | Left Feature Regions list + Overview screen |
| Blast risks list | Blast Radius screen / inspector after See impact |
| Trends charts | Insights (M-024) — later |

---

## C — Landing (Vercel / docs later)

### Keep (copy themes)

- “Understand any codebase at a glance”  
- Features: Repository Map · Blast Radius · Codebase DNA  
- How it works: connect → analyze → explore  

### Rewrite for Prism truth

- Local-first / offline / no required cloud  
- Connect = open local path / IDE workspace (not GitHub OAuth as core)  
- MCP + CLI + VS Code / Cursor — not Slack-first SaaS  
- Brand: locked faceted P + Signal Chart light  

Defer until M-038 / marketing site. Do not block M-042.

---

## Agent kickoff prompts

### Map (do this first)

```text
Read plans/mockups/screens/SPECS.md section A and
plans/mockups/screens/html/01-repository-map.html (reference only).
Rematerialize into @prism/ui Signal Chart (tokens.css / map.css).
Keep: left KPI sidebar, center canvas with dependency edges,
      right inspector, search, feature regions, Open/See impact.
Blast rings: only when a node is selected (clear on deselect).
Drop: dark theme, cyan/violet accents (use #0F766E), SaaS Share chrome.
Active milestone branch only; @prism/core for data.
```

### Overview / DNA (later slice)

```text
Read SPECS.md section B. Add Health/DNA summaries into Views / Overview —
not replacing the Map as home.
Use getHealth / intelligence DTOs from @prism/core.
```

---

## File checklist

- [x] HTML archived under `screens/html/`  
- [x] Conflicts documented  
- [x] Owner override: left sidebar + edges keep; blast rings on selection  
- [ ] Optional: PNG screenshots of HTML opened in browser into `screens/*.png`  
