# UXPilot → Prism repo handoff (for agents)

How to export designs from UXPilot and land them in this repo so Cursor / agents can implement against them.

---

## 1. Export from UXPilot (pick what you have)

Do **all three** if possible. Agents work best with **images + written specs**; Figma/code are bonuses.

| Export | How (typical UXPilot UI) | Why agents need it |
|---|---|---|
| **PNG / WebP screenshots** | Per-screen download / export image · or full-page capture | Visual ground truth (agents can “see” layout) |
| **Figma** | Install [UX Pilot Figma plugin](https://www.figma.com/community/plugin/1257688030051249633/ux-pilot-ai-ui-generator-design-system-wireframe-generator) → **Save for Figma** / **Retrieve in Figma** | Editable layers, spacing, components |
| **HTML / code** | Export code (and GitHub sync if enabled) | Rough structure; **not** production Prism code — reference only |

Also copy from UXPilot (or write yourself):

- Screen names + one-line job each  
- Any component notes / variants (hover, selected, empty)  
- Public or team **share link** to the UXPilot project (optional, for humans)

> Tip: Figma export often needs 15–30 min cleanup (auto-layout, naming). For agent implementation, **clean PNGs + a SPECS.md beat a messy Figma dump**.

---

## 2. Drop files into the repo (canonical layout)

Create this tree under `plans/mockups/` (names matter for agents):

```text
plans/mockups/
├── UXPILOT_HANDOFF.md          ← this file
├── UXPILOT_FULL_PRODUCT_PROMPT.md
├── screens/                    ← NEW: export landing zone
│   ├── README.md               ← index of screens + links
│   ├── SPECS.md                ← agent-facing implementation specs (SoT for implement)
│   ├── html/                   ← UXPilot HTML archives (reference only)
│   │   ├── 01-repository-map.html
│   │   ├── 02-dashboard.html
│   │   └── 03-landing.html
│   ├── A-repository-map.png    ← optional PNG captures
│   ├── B-file-density.png
│   ├── C-blast-radius.png
│   ├── D-health-layers.png
│   ├── E-code-explorer.png
│   ├── F-repository-dna.png
│   ├── G-safe-delete.png
│   ├── H-insights.png
│   ├── I-ide-embedding.png
│   └── J-cli-mcp.png
├── figma.md                    ← NEW: Figma file URL + page names (if any)
└── LOCKED.md                   ← update status when you lock screens
```

**Rules**

- Prefer **1440×900** (or 2× retina) PNGs, one file per screen.  
- Filenames: `Letter-kebab-name.png` matching the prompt screens (A–J).  
- Do **not** commit huge Figma binaries; put a **link** in `figma.md`.  
- Do **not** treat UXPilot HTML as `@prism/ui` source — rewrite into existing tokens/components.

---

## 3. Write `screens/SPECS.md` (this is what agents follow)

Use this template (fill after you drop PNGs):

```markdown
# Prism UI specs (UXPilot)

Status: Draft | Ready for implement
Source: UXPilot export YYYY-MM-DD
Brand SoT: still LOCKED (Signal Chart) — mockups must not override tokens in DESIGN.md

## Shell (all app screens)

- Top bar 56px: mark + Prism · Search · Views · Reindex
- Main: one canvas
- Right: Inspector ~312px
- CTAs after select: Open (filled) · See impact (outline)
- Tokens: #0F766E brand · #0F1C24 ink · #E8EEF2–#F3F7F9 canvas · Satoshi + IBM Plex Mono

## Screen index

| ID | File | Job | Implement in | Priority |
|---|---|---|---|---|
| A | A-repository-map.png | Orient & go | @prism/ui Map + playground | P0 |
| B | B-file-density.png | File mass | DensityMap / File zoom | P0 |
| … | … | … | … | … |

## Per-screen notes

### A — Repository Map
- Must match / diverge from current playground: …
- Components: ZoomRail, MapNode, Inspector, …
- States: default · selected Billing · empty search
- Do not implement: …

### C — Blast Radius
- Blocked on M-020 Core API — UI shell only until then
- …

## Conflicts with locked system

List any UXPilot choices that fight DESIGN.md (purple, KPI strips, etc.) and the **resolution** (usually: keep locked tokens, adapt layout only).

## Agent prompt (paste into Cursor)

Implement UI for screen A from plans/mockups/screens/A-repository-map.png
and SPECS.md. Use @prism/ui tokens.css / map.css. Do not invent new brand colors.
Consume @prism/core only. Stay on the active milestone branch.
```

---

## 4. Lock what you approve

When a screen is good enough to build:

1. Move or mark it in [`LOCKED.md`](./LOCKED.md) (e.g. “UI screen mockups: A, B locked”).  
2. Note **approved date** + “implement from `screens/`”.  
3. Tell the agent which milestone owns the work (today: **M-042** for Map chrome; Blast Radius UI waits for **M-020**).

Agents should treat **LOCKED brand tokens** as higher priority than any one-off color in a PNG.

---

## 5. How to ask an agent to build

Minimum message:

```text
Handoff: UXPilot designs are in plans/mockups/screens/.
Read SPECS.md + the PNG for screen A.
Implement against M-042 (or named milestone) on the current branch.
Match layout/spacing/hierarchy from the PNG; keep Signal Chart tokens from
plans/mockups/DESIGN.md and packages/ui/src/tokens.css.
Do not copy UXPilot HTML into the package.
```

Better: attach the PNG in chat **and** keep it on disk under `screens/` so later turns can re-read it.

---

## 6. Recommended workflow (checklist)

- [ ] Export PNG for each screen A–J into `plans/mockups/screens/`  
- [ ] Add Figma URL to `plans/mockups/figma.md` (optional but useful)  
- [ ] Fill `screens/SPECS.md` (shell + per-screen + conflicts)  
- [ ] Update `LOCKED.md` for approved screens  
- [ ] Open Cursor → point agent at SPECS + one screen at a time  
- [ ] Review in playground (`bun run playground`) against the PNG  

---

## 7. What not to do

- Don’t dump unsorted exports into `packages/ui/`  
- Don’t let generated HTML replace `@prism/ui` architecture  
- Don’t unlock brand colors because UXPilot drifted purple/dark  
- Don’t ask agents to implement the entire product from one mega-PNG — **one screen (or shell + one canvas) per milestone slice**
