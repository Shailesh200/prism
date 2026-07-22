---
version: alpha
name: Prism
description: Local-first software intelligence — cartographic engineering maps for code. Calm, precise, instrument-grade. Not an AI chatbot product.
note: "PRODUCT UI RELOCKED to UXPilot dark (ADR-0014). Live tokens are packages/ui/src/tokens.css (dark navy, cyan #00C2C2, violet #6C63FF, Inter + JetBrains Mono). The light Signal Chart tokens below are retained as history / future light-theme flip."
colors:
  primary: "#0F766E"
  primary-strong: "#115E59"
  on-primary: "#FFFFFF"
  secondary: "#5A6B76"
  tertiary: "#D97706"
  risk: "#D97706"
  risk-extreme: "#E11D48"
  safe: "#059669"
  ink: "#0F1C24"
  ink-muted: "#5A6B76"
  line: "#C5D0D8"
  panel: "#FBFCFD"
  canvas: "#E8EEF2"
  canvas-alt: "#F3F7F9"
  tile: "#F3F7F9"
  dark-chrome: "#1A2330"
  dark-ink: "#E8EEF2"
typography:
  brand:
    fontFamily: Satoshi
    fontSize: 1.125rem
    fontWeight: 650
    letterSpacing: -0.02em
  h1:
    fontFamily: Satoshi
    fontSize: 1.5rem
    fontWeight: 650
    letterSpacing: -0.02em
  h2:
    fontFamily: Satoshi
    fontSize: 1.15rem
    fontWeight: 600
    letterSpacing: -0.02em
  body-md:
    fontFamily: Satoshi
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: Satoshi
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: Satoshi
    fontSize: 0.75rem
    fontWeight: 600
    letterSpacing: 0.04em
  mono:
    fontFamily: IBM Plex Mono
    fontSize: 0.75rem
    fontWeight: 400
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 10px
    typography: "{typography.body-sm}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 10px
    typography: "{typography.body-sm}"
  top-bar:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    height: 56px
  inspector:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  map-region:
    backgroundColor: "{colors.tile}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  search-field:
    backgroundColor: "{colors.tile}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
---

# Prism — DESIGN.md (Signal Chart tokens)

> **Brand + design system: LOCKED.** See [`LOCKED.md`](./LOCKED.md).  
> UI screen mockups are **deferred** — prompts below are optional archive for later (M-018+).  
> App uses: locked PNGs in `logo/` + tokens in this file / [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md).

## Locked application assets

| # | Asset | Status | Path |
|---|---|---|---|
| 1 | Master icon (faceted P) | **LOCKED** | `logo/prism-mark.png` + `logo/exports/prism-mark-*` |
| 2 | Lockup light | **LOCKED** | `logo/prism-lockup.png` + `logo/exports/prism-lockup-light-*` |
| 3 | Lockup dark | **LOCKED** | `logo/prism-lockup-dark.png` + `logo/exports/prism-lockup-dark-*` |
| 4+ | UI screen mockups | **Deferred** | Not required to start implementation |

**Ship into the app:** logo PNGs + CSS variables from tokens below. Do not embed UI mockup screenshots.

---

## Overview

Prism is a **local-first Software Intelligence Engine** — “Google Maps for code.”  
Users navigate repositories as terrain: features, dependencies, blast radius, and health.

**Vibe:** calm precision, spatial clarity, instrument-grade trust.  
**Theme name:** Signal Chart — topographic map + flight instruments + code.  
**Not:** AI chat UI, neon copilot, purple SaaS dashboard, KPI hero strips.

**Brand metaphor:** light through a prism → many *views* of the same codebase.

**Default mode:** light atmospheric “day chart.” Dark chrome only for IDE embedding.

**Product shell (every app screen):**

- Top bar 56px: Prism mark + wordmark · Search · Views · Reindex  
- Main: one map/canvas job  
- Right: Inspector for selection  
- Selection CTAs only: **Open** (filled teal) + **See impact** (outline teal)

---

## Colors

| Token | Hex | Use |
|---|---|---|
| Primary / brand | `#0F766E` | Mark, primary CTA, selected map region |
| Primary strong | `#115E59` | Hover / emphasis |
| On primary | `#FFFFFF` | Text on teal buttons |
| Ink | `#0F1C24` | Primary text, wordmark |
| Ink muted / secondary | `#5A6B76` | Secondary labels, captions |
| Line | `#C5D0D8` | Hairline borders, grid |
| Panel | `#FBFCFD` | Top bar, inspector |
| Canvas | `#E8EEF2` → `#F3F7F9` | Map basemap mist gradient |
| Tile | `#F3F7F9` | Search field, region fills |
| Risk / tertiary | `#D97706` | Blast radius, risk hotspots only |
| Safe | `#059669` | Healthy / covered (sparingly) |
| Dark chrome | `#1A2330` | IDE frame / night chart only |

**Rules**

- One accent family: **teal**. Never purple / violet / indigo candy.  
- Risk amber only when the screen job is risk/impact.  
- No neon glow, no rainbow gradients, no glassmorphism stacks.

---

## Typography

- **Brand / UI:** Satoshi (or General Sans / Switzer) — geometric, slightly sharp.  
- **Code / file paths:** IBM Plex Mono (or JetBrains Mono).  
- Avoid Inter, Roboto, Arial as the brand face.  
- Map labels: feature names in sans; paths in mono.  
- Comfortable IDE density; no giant marketing headlines on product screens.

---

## Layout

- Platform: **Desktop web**, 1440×900 (16:9).  
- Page margin: ~24px.  
- Shell: top instrument bar → full-bleed map stage → right inspector (~280–320px).  
- **Map is the product** — first viewport answers “Where am I in this repo?”  
- Progressive disclosure: one job per screen.  
- No card soup; cards only when they hold a selection interaction.  
- No KPI / stat strips in the hero.

---

## Elevation & Depth

- Soft cool mist gradient behind the map + faint grid / topo lines.  
- Borders: 1px hairlines (`#C5D0D8`).  
- One soft shadow max (floating inspector only).  
- No multi-layer glow, no ambient particle networks.

---

## Shapes

- Controls: **6–10px** radius (`rounded.md` = 8px).  
- Map regions: rounded rectangles, slightly tighter.  
- Pills only for small view chips / zoom rail — sparingly.  
- Icons: stroke, geometric, map-legend style (1.5–2px).

---

## Components

| Component | Spec |
|---|---|
| **Logo mark** | **LOCKED** — faceted geometric “P”: sharp crystalline shards/facets, solid teal `#0F766E`, thin negative-space cuts, pointed stem tip. Transparent PNG exports in `logo/exports/`. |
| **Lockup** | Locked mark left + wordmark “Prism” in ink `#0F1C24` (white on dark). Horizontal; optional stacked. |
| **Top bar** | 56px, panel bg, hairline bottom. Mark + “Prism”, center search, right Views + Reindex. |
| **Search** | Placeholder: “Find a feature or file…” Tile fill, 8px radius. |
| **Map regions** | Large rounded rects: Auth, Billing, API, UI, Data, Jobs — label + “N files”. Selected = stronger teal. |
| **Dependency curves** | 2–3 subtle teal/cyan routes max — never spaghetti. |
| **Zoom rail** | Repo / Package / Feature / File — Feature emphasized by default. |
| **Inspector** | Title case section label, selection name, 1-line description, mono file list, two CTAs. |
| **Primary button** | Filled `#0F766E`, white text, 8px radius — label **Open**. |
| **Secondary button** | Outline teal / panel fill — label **See impact**. |
| **Blast halo** | Soft amber concentric rings — once, not infinite neon pulse. |

---

## Do's and Don'ts

**Do**

- Keep flat, minimal, cartographic.  
- Use teal as the only brand accent.  
- One clear job per screen.  
- Large readable labels, generous whitespace.  
- Export clean PNGs for review.

**Don't**

- Purple / indigo SaaS gradients.  
- Warm cream + terracotta “AI editorial” look.  
- Robot / brain / sparkle “AI” icons.  
- Toy rainbow prisms, emoji, glassmorphism.  
- Dashboard KPI strips, pill clusters, busy charts.  
- Dependency hairballs.  
- Redesign the shell between screens — same chrome always.

---

## Optional screen prompts (deferred — archive)

> Only use if you later want PNG UI specs. Brand is already locked — do not regenerate the mark/lockups.

### 1) Logo mark — LOCKED (do not regenerate)

Canonical description of the locked mark (for lockups / UI chrome only):

```text
LOCKED Prism logo mark (do not redesign):
- Faceted geometric capital "P" monogram
- Built from sharp crystalline shards / low-poly facets (triangles + trapezoids)
- Thin white negative-space cuts between facets
- Thick vertical stem on the left with a sharp downward-pointing tip at the bottom
- Angular (not round) bowl / loop on the right
- Solid signal teal #0F766E
- Flat, premium, precise — no glow, no 3D chrome, no rainbow
```

Repo files already generated: `logo/prism-mark.png`, transparent variants in `logo/exports/` (teal / ink / light / white × sizes).

---

### 2) Horizontal lockup — light (NEXT)

```text
Create ONE premium horizontal logo lockup for Prism. Not a moodboard. Not multiple options. Not a presentation.

REFERENCE: Use the attached locked Prism mark exactly — faceted geometric "P" made of crystalline shards in solid teal #0F766E. Do not redesign, simplify, round, or replace the mark. Keep facet cuts identical.

Layout (exact):
- Landscape canvas, wide enough for icon + wordmark with comfortable padding
- Left: locked faceted P mark (height ~48–64px visual weight)
- Right: wordmark "Prism" only — no tagline, no subtitle
- Vertical optical center-align mark and wordmark
- Gap between mark and word: ~0.35× mark height (tight professional spacing)
- Outer padding: generous white space; mark+word centered as a unit

Typography:
- Word "Prism" in a premium geometric sans (Satoshi / Neue Haas Grotesk / similar)
- Weight: semibold / bold (not thin, not ultra-black)
- Color: ink #0F1C24
- Letter-spacing: slightly tight (−1% to −2%)
- Capital P of "Prism" should feel related to the mark but is normal letterforms — do not facet the wordmark

Background & craft:
- Pure white #FFFFFF background
- Flat, crisp edges, no drop shadow, no glow, no gradient
- No labels ("Logo", "Lockup", "Horizontal"), no frames, no dotted grids, no cards
- Export as a single clean PNG suitable for app headers

Quality bar: looks like Linear / Vercel brand lockup quality. Quiet luxury for engineers.
```

**Save as:** `logo/prism-lockup.png`

---

### 3) Horizontal lockup — dark

```text
Create ONE premium horizontal logo lockup for Prism on a dark background. One asset only.

REFERENCE: Attached locked faceted teal #0F766E "P" mark — do not change its geometry or color.

Layout:
- Same horizontal composition as the light lockup: mark left, wordmark "Prism" right
- Same spacing rules (tight professional gap, optical vertical alignment)
- Background: solid dark navy #1A2330 (full bleed, no vignette)
- Wordmark "Prism": pure white #FFFFFF, same premium geometric sans, semibold/bold, slightly tight tracking
- Mark stays teal #0F766E (not white, not light gray)

Forbidden: glow, neon, gradients, second variants, labels, frames, mockup chrome.
Export one clean PNG for dark IDE headers.
```

**Save as:** `logo/prism-lockup-dark.png`

---

### 4) Stacked lockup — light (optional)

```text
Create ONE stacked logo lockup for Prism. One asset only.

REFERENCE: Attached locked faceted teal #0F766E "P" mark — geometry unchanged.

Layout:
- Square or slightly tall canvas, pure white #FFFFFF
- Top: locked mark centered
- Below: wordmark "Prism" centered, ink #0F1C24, premium geometric sans, semibold
- Vertical gap between mark and word ~0.3× mark height
- Generous padding; no other elements

No tagline, no labels, no frames. Flat, crisp PNG.
```

**Save as:** `logo/prism-lockup-stacked.png`

---

### 5) Repository Map — default screen (after lockups)

```text
Design ONE high-fidelity desktop UI mockup for Prism — the DEFAULT Repository Map screen.
Canvas: 1440×900, 16:9, light "Signal Chart" theme. One screen only — not a marketing page, not a dashboard collage.

PRODUCT: Prism — local-first software intelligence. Users navigate a codebase like a map ("Google Maps for code"). Calm, precise, cartographic. NOT an AI chat product.

LOCKED BRAND (must use):
- Top-left brand: attached faceted teal #0F766E "P" mark + wordmark "Prism" in ink #0F1C24
- Do not invent a different logo

SHELL (identical on all product screens — lock this chrome):
1) TOP BAR — height 56px, background #FBFCFD, 1px bottom border #C5D0D8
   - Left: locked mark (20–24px) + "Prism"
   - Center: search field, placeholder "Find a feature or file…", fill #F3F7F9, radius 8px, width ~420px
   - Right: text buttons "Views" and "Reindex" (muted #5A6B76, not primary)
2) MAIN STAGE — remaining width minus inspector; cool mist canvas gradient #E8EEF2 → #F3F7F9; faint topo/grid lines (very subtle)
3) RIGHT INSPECTOR — width ~300px, background #FBFCFD, left hairline #C5D0D8

MAP CONTENT (main stage):
- Large rounded feature regions (radius ~8–10px), soft fills, hairline borders:
  Auth · Billing · API · UI · Data · Jobs
- Each region shows: feature name (sans) + "N files" (muted smaller)
- Billing is SELECTED: stronger teal fill/border #0F766E, slightly elevated
- Only 2–3 subtle curved dependency routes in muted teal — NEVER spaghetti / hairball
- Small hint chip near bottom-left of map: "Click a region to inspect"
- Vertical ZOOM RAIL on left of map or bottom-left: Repo / Package / Feature / File — "Feature" emphasized (teal)

INSPECTOR CONTENT:
- Eyebrow label: "SELECTED FEATURE" (small caps / 12px, muted, tracked)
- Title: "Billing"
- One-line description: "Payments, invoices, and charge flows"
- Section "Files" with 4 mono paths, e.g.:
  packages/billing/charge.ts
  packages/billing/invoice.ts
  apps/api/routes/pay.ts
  apps/web/checkout.tsx
- Prompt: "What do you want to do?"
- Two CTAs only:
  - Primary filled button #0F766E white text: "Open"
  - Secondary outline teal: "See impact"
- Helper under CTAs (muted, small): "Open jumps to code. See impact shows blast radius."

STRICTLY FORBIDDEN:
- KPI / stat strips, metric cards, charts in the hero
- Purple, violet, neon glow, glassmorphism, emoji
- Chat bubbles, AI avatars, copilot panels
- Dense dependency graphs
- Multiple competing side panels

Job of the screen: in <3 seconds the user knows to click a region or use search.
Export one crisp PNG 1440×900.
```

**Save as:** `01-repository-map.png`

---

### 6) Blast Radius

```text
Design ONE desktop UI mockup: Prism Blast Radius view. 1440×900.

CRITICAL: Reuse the EXACT same shell as Repository Map (top bar, search, Views, Reindex, zoom rail, inspector width, locked faceted P + "Prism" brand). Do not redesign chrome, colors, or typography.

SCENE:
- Map still shows feature regions; focus remains on Billing
- Selected symbol highlight on "chargeCustomer" (small pin or bold label on Billing)
- Soft amber concentric BLAST HALO (#D97706) around the selection — 2–3 rings, low opacity, NO neon glow, NO infinite pulse animation look
- 4–6 affected nodes/files faintly highlighted outside Billing (muted amber or desaturated)

INSPECTOR (replace previous content):
- Eyebrow: "BLAST RADIUS"
- Title: "chargeCustomer"
- Small text (not a giant gauge): "Risk 72 · medium-high"
- Section "Affected files" — 5 mono paths
- Section "Tests likely affected" — 3 mono test paths
- CTAs only two: "Open file" (filled teal) | "Copy report" (outline)
- No third button, no chat, no KPI strip

Same Signal Chart light palette. One PNG export.
```

**Save as:** `02-blast-radius.png`

---

### 7) Risk view

```text
Design ONE desktop UI mockup: Prism Risk view. 1440×900.
Same locked shell and faceted P brand as Repository Map — do not redesign.

CHANGES FROM DEFAULT MAP:
- Top bar "Views" indicates active view "Risk" (subtle teal underline or chip)
- Most feature regions muted / desaturated
- Exactly 2–3 amber hotspot regions (#D97706 soft fill) — e.g. Billing, Jobs
- No blast halo rings; hotspots are filled regions
- Dependency curves almost hidden

INSPECTOR:
- Eyebrow: "RISK VIEW"
- Title: "Hotspots"
- Ranked list (3 items) with short why:
  1. Billing — high coupling
  2. Jobs — volatile changes
  3. Auth — wide fan-out
- CTAs: "Open" | "See impact" only

Do NOT show debt, ownership, coverage, or health layers at the same time.
No purple, no glow, no KPI strip. One PNG.
```

**Save as:** `03-risk-view.png`

---

### 8) VS Code embed

```text
Design ONE desktop UI mockup: Prism embedded inside a VS Code-like IDE. 1440×900.

FRAME (left ~40%):
- Realistic dark IDE chrome #1E1E1E / #252526
- Activity bar with icons (Explorer selected)
- Sidebar file tree (muted)
- Editor tab: "charge.ts" with TypeScript code (~15–20 readable lines), syntax colors restrained

WEBVIEW (right ~60%):
- Prism Repository Map shell (LIGHT Signal Chart is OK inside dark IDE)
- Locked faceted teal P + "Prism" in Prism top bar
- Same map regions; Billing selected
- Same inspector with Open | See impact
- Slightly compressed but still readable — do not invent a new Prism layout

Overall: product-in-product realism, not a marketing collage.
No purple, no neon, no emoji. One PNG.
```

**Save as:** `04-vscode-embed.png`

---

### 9) Engineering Health (optional, later)

```text
Design ONE desktop UI mockup: Prism Engineering Health / layers view. 1440×900.
Same locked shell + faceted P brand.

Job: show health as MAP LAYERS, not a dashboard of KPI cards.

- Views indicates "Health"
- Map regions tinted softly by health (teal healthy, amber watch, coral sparse) — still cartographic
- Legend: Healthy / Watch / At risk (small, corner)
- Inspector: selected region summary + 3 factors (coverage, coupling, churn) as short text rows — NOT giant gauges
- CTAs: Open | See impact

Forbidden: hero stat strips, pie charts, purple, glow.
One PNG: 05-engineering-health.png
```

---

## Bring back to Cursor (only if regenerating deferred UI)

1. Export one PNG from Stitch  
2. Drop into `plans/mockups/` with the names above  
3. Add to `gallery.html` if reviewing  
4. Do **not** replace locked brand files in `logo/` without owner approval
