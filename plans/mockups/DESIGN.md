---
version: beta
name: Prism
description: Local-first software intelligence — cartographic engineering maps for code. Calm, precise, instrument-grade. Not an AI chatbot product.
note: "PRODUCT UI is the UXPilot dark system, relocked by ADR-0014. Live source of truth = packages/ui/src/tokens.css. This file is the human/AI-shareable design brief (use the 'Stitch design brief' block with Google Stitch). The old light 'Signal Chart' tokens are retired; see History."
theme: dark
colors:
  brand: "#00C2C2"
  brand-strong: "#00DCD4"
    10|  on-brand: "#0A0E1A"
  violet: "#6C63FF"
  ink: "#FFFFFF"
  ink-muted: "#94A3B8"
  line: "#2A334A"
  canvas: "#0A0E1A"
  panel: "#131926"
  panel-2: "#0F1420"
  tile: "#1E2433"
  elev: "#1E2433"
    20|  safe: "#10B981"
  risk: "#F59E0B"
  risk-extreme: "#F43F5E"
typography:
  brand:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: 650
    letterSpacing: -0.02em
  h1:
    30|    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 650
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 1.15rem
    fontWeight: 600
    letterSpacing: -0.02em
  body-md:
    40|    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.4
  label:
    50|    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 600
    letterSpacing: 0.04em
    textTransform: uppercase
  mono:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: 400
rounded:
    60|  sm: 6px
  md: 8px
  lg: 12px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
    70|shell:
  sidebar-w: 224px
  topbar-h: 48px
  inspector-w: 288px
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.md}"
    padding: 10px
    80|    typography: "{typography.body-sm}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.ink-muted}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.md}"
  sidebar:
    backgroundColor: "{colors.panel}"
    width: "{shell.sidebar-w}"
    activeAccent: "{colors.brand}"
    90|  top-bar:
    backgroundColor: "{colors.canvas}"
    height: "{shell.topbar-h}"
  card:
    backgroundColor: "{colors.panel}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.lg}"
  inspector:
    backgroundColor: "{colors.panel}"
    width: "{shell.inspector-w}"
   100|    rounded: "{rounded.lg}"
---

# Prism — DESIGN.md (dark product system)

> **Brand + design system: LOCKED.** See [`LOCKED.md`](./LOCKED.md) and ADR-0014.
> **Live tokens:** [`packages/ui/src/tokens.css`](../../packages/ui/src/tokens.css) — the code is the source of truth; this doc mirrors it for humans and AI design tools.
> **Generating screens?** Use [Google Stitch](https://stitch.withgoogle.com). Paste the **Stitch design brief** below, then one screen prompt from [`STITCH_SCREEN_PROMPTS.md`](./STITCH_SCREEN_PROMPTS.md).

## Locked application assets

| # | Asset | Status | Path |
|---|---|---|---|
| 1 | Master icon (faceted P) | **LOCKED** | `logo/prism-mark.png` + `logo/exports/prism-mark-*` |
| 2 | Lockup light | **LOCKED** | `logo/prism-lockup.png` + `logo/exports/prism-lockup-light-*` |
| 3 | Lockup dark | **LOCKED** | `logo/prism-lockup-dark.png` + `logo/exports/prism-lockup-dark-*` |

**Ship into the app:** logo PNGs + the CSS variables in `tokens.css`. Do not embed UI mockup screenshots or regenerate the mark.

---

## Stitch design brief (paste this FIRST, before any screen prompt)

Copy this block into Google Stitch at the start of a project, then send a single
screen prompt. Keep it prepended so tokens don't drift between screens.

```text
Product: "Prism" — a local-first software-intelligence desktop/web app ("Google
Maps for code"). Calm, precise, instrument-grade. NOT an AI chatbot.

THEME: dark, flat, cartographic. Deep navy canvas with a faint dot grid.
COLORS: canvas #0A0E1A, panel #131926, panel-2 #0F1420, elevated tiles #1E2433,
hairline borders #2A334A; text #FFFFFF, muted text #94A3B8; brand teal #00C2C2
(strong #00DCD4), violet #6C63FF; signals emerald #10B981 (good), amber #F59E0B
(risk), rose #F43F5E (extreme). Teal is the ONLY brand accent.
TYPE: Inter for UI; JetBrains Mono for numbers, file paths, code, SHAs. Labels
12px UPPERCASE, letter-spacing 0.04em, muted. Headings 18px/600. Body 15px.
SHAPE: radius 6/8/12px, pills 999px. 1px #2A334A hairlines. Soft dark shadows
only (no glow, no glassmorphism, no neon). Spacing scale 4/8/16/24/32.

APP SHELL (identical on every in-app screen):
- Fixed 224px LEFT SIDEBAR: Prism logo mark + wordmark at top; a workspace chip
  (repo name + branch, git icon); nav group "Workspace" = Overview, Repository
  Map, Codebase DNA, Blast Radius, Trends; nav group "Settings" = Integrations,
  Settings, Audit Logs; a user chip (avatar + name) pinned bottom. Active item =
  teal left-accent bar + subtle teal-tinted background.
- 48px TOP BAR: screen title on the left with subtitle "repo · branch · Last
  sync 4m ago"; contextual actions on the right (ghost + one teal primary).
- Content area: dark panels/cards (#131926, 1px #2A334A, radius 12px).

RULES: one clear job per screen; realistic placeholder data (real-looking file
paths, counts, %), never lorem; AA contrast on dark; visible teal focus rings;
never color-only. Desktop-first 1440px, graceful to 1024px.
```

---

## Colors

| Token | Hex | Use |
|---|---|---|
| Brand / teal | `#00C2C2` | Mark, primary CTA, selected region, active nav, links |
| Brand strong | `#00DCD4` | Hover / emphasis |
| On brand | `#0A0E1A` | Text on teal buttons |
| Violet | `#6C63FF` | Secondary accent (sparingly — e.g. a DNA factor) |
| Ink | `#FFFFFF` | Primary text |
| Ink muted | `#94A3B8` | Secondary labels, captions, icons |
| Line | `#2A334A` | Hairline borders, grid, dividers |
| Canvas | `#0A0E1A` | App background / top bar |
| Panel | `#131926` | Sidebar, cards, inspector |
| Panel 2 | `#0F1420` | Recessed surfaces |
| Tile / elevated | `#1E2433` | Chips, node fills, tooltips |
| Safe / emerald | `#10B981` | Healthy / covered |
| Risk / amber | `#F59E0B` | Coupling, risk, unpushed |
| Extreme / rose | `#F43F5E` | High risk / errors |

**Rules:** one accent family — **teal**. Violet only as an occasional data hue.
Amber/rose only for risk. No purple SaaS gradients, no neon glow, no rainbow, no
glassmorphism stacks.

---

## Typography

- **UI face:** Inter (system-ui fallback). Weights 400/600/650.
- **Code / paths / numbers / SHAs:** JetBrains Mono.
- Labels: 12px, UPPERCASE, tracked 0.04em, muted `#94A3B8`.
- Headings 18px/600; body 15px/1.45; small 13px.
- No giant marketing headlines on product screens; IDE-comfortable density.

---

## Layout & shell

- Platform: **desktop web**, 1440×900 primary; usable to 1024px.
- **224px left sidebar** (nav) · content area · optional **288px right inspector**.
- **48px top bar** with screen title + "repo · branch · Last sync" subtitle.
- Progressive disclosure: one job per screen.
- Cards hold real content/interactions — no card soup, no empty KPI hero strips.
- The Repository Map is the flagship spatial screen; other screens are panelled.

---

## Elevation & depth

- Deep navy canvas with a faint dot grid + subtle vignette behind the map.
- Borders: 1px hairlines `#2A334A`.
- Dark elevation ladder (soft shadows) for cards, tooltips, floating inspector.
- No multi-layer glow, no ambient particle networks.

---

## Shapes

- Controls / cards: 6–12px radius. Pills 999px for chips/badges.
- Map nodes: rounded rectangles; selected = teal-tinted fill + teal border.
- Icons: stroke, geometric, 1.5–2px (lucide-style).

---

## Components

| Component | Spec |
|---|---|
| **Logo mark** | **LOCKED** faceted geometric teal "P" (`logo/`). Never redesign. |
| **Left sidebar** | 224px, panel `#131926`; logo + repo/branch chip; grouped nav; active item = teal left-accent + tinted bg; user chip pinned bottom. |
| **Top bar** | 48px, canvas bg; title + "repo · branch · Last sync"; right actions (ghost + one teal primary). |
| **KPI / stat card** | Panel `#131926`, 1px `#2A334A`, radius 12px; 12px muted uppercase label, large value (mono when numeric), tiny note; optional meter bar; a small `?` explain popover. |
| **Map regions/nodes** | Rounded rects, tile fill `#1E2433`; label + "N files"; selected = teal. |
| **Dependency edges** | Thin teal routes; keep legible — never a hairball. |
| **Inspector** | 288px panel; uppercase eyebrow, title, 1-line description, mono lists, ≤2 CTAs. |
| **Primary button** | Filled teal `#00C2C2`, ink-on-brand text, 8px radius. |
| **Ghost button** | Transparent, 1px `#2A334A`, muted text; "Soon" variant is disabled with a small pill. |
| **Badge / tag** | Pill; tone maps to signal color (emerald/amber/rose/teal); e.g. amber "Local" for unpushed commits. |
| **Tooltip / popover** | Elevated tile `#1E2433`, hairline, soft shadow; used for "how is this calculated" explainers. |
| **Blast halo** | Soft amber concentric rings on the selected node only — not infinite pulse. |

---

## Do's and Don'ts

**Do**

- Flat, minimal, cartographic; teal as the only brand accent.
- One clear job per screen; readable labels; generous spacing.
- Mono for paths/numbers/SHAs; real-looking placeholder data.
- Keep the shell (sidebar + top bar) identical across screens.

**Don't**

- Purple/indigo SaaS gradients, neon glow, glassmorphism, emoji.
- Robot/brain/sparkle "AI" icons or chat/copilot panels.
- Empty KPI hero strips, pill clusters, dependency hairballs.
- Redesign the chrome between screens, or restyle the tokens.

---

## Locked logo prompts (archive — brand already generated)

> The mark and lockups are LOCKED. Only use these if regenerating brand assets
> with owner approval. Everything else (product screens) → `STITCH_SCREEN_PROMPTS.md`.

<details>
<summary>Canonical locked mark description</summary>

```text
LOCKED Prism logo mark (do not redesign):
- Faceted geometric capital "P" monogram from sharp crystalline shards
- Thin negative-space cuts between facets; thick left stem with a pointed tip
- Solid signal teal #00C2C2; flat, premium, precise — no glow, no 3D, no rainbow
```
</details>

---

## History

- The original **light "Signal Chart"** palette (teal `#0F766E`, cream canvas,
  Satoshi) was the pre-product brand direction. **ADR-0014 relocked** the product
  UI to the dark system above; the light tokens are retired for the app. Brand
  logo assets remain shared across both.
