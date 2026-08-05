# Prism — Product Theme, Vibe & Design System

> Status: **LOCKED** (brand assets); **product UI relocked to UXPilot dark** — see [ADR-0014](./adr/0014-uxpilot-dark-product-ui.md).  
> Brand files: [`mockups/LOCKED.md`](./mockups/LOCKED.md) · Gallery: [`mockups/gallery.html`](./mockups/gallery.html)  
> **Product UI (M-042+): dark theme** — navy canvas, cyan `#00C2C2`, violet `#6C63FF`, Inter + JetBrains Mono. Live tokens: `packages/ui/src/tokens.css`. The light Signal Chart notes below are retained as history and as the future light-theme token flip.

---

## 1. Where we’re going (product vibe)

Prism is **cartographic engineering intelligence** — not an AI chat product, not a neon “copilot” skin.

**Feeling:** calm precision, spatial clarity, instrument-grade trust.  
Think: *topographic map + flight instruments + code*, not *SaaS dashboard + purple glow*.

| Axis | Prism is… | Prism is not… |
|---|---|---|
| Metaphor | Maps, routes, landmarks, blast radius | Chat bubbles, agent avatars |
| Emotion | Oriented, in control, clear | Hype, magical, opaque |
| Pace | Deliberate zoom / focus | Notification noise |
| Trust | Local, inspectable, explainable | Black-box “AI said so” |
| Density | Progressive disclosure | Wall of cards and stat pills |

**One-liner:** *Turn a repo into terrain you can navigate.*

---

## 2. Brand personality

- **Prism** = light split into spectrums → many *views* (architecture, deps, risk, ownership) of the same codebase  
- Voice: short, technical, confident, no emoji fluff  
- Hero signal: the **Map** (and the word Prism), not a marketing headline stack

---

## 3. Visual theme — “Signal Chart”

Name for the system: **Signal Chart**.

### Mood references (spirit, not copies)

- Aviation sectional charts / instrument panels  
- Modern GIS (clean layers, muted basemap, sharp overlays)  
- High-end IDE chrome without clutter  

### Mode

- **Default: light atmospheric** (day chart) — primary for docs + first-run Map  
- **Optional: dim “night chart”** later for IDE embedding — secondary, not the brand default  
- Avoid pure flat white and avoid generic purple dark mode

### Atmosphere

- Soft **depth field** behind the Map: cool mist gradient + faint grid/topo lines (not loud mesh)  
- Map canvas is the dominant plane; UI chrome is thin and recessed  
- Real anchor = **the repository structure rendered as geography**, not abstract blobs alone

---

## 4. Color system

Semantic, map-first tokens (CSS variables).

| Token | Role | Direction |
|---|---|---|
| `--bg-canvas` | App / map basemap | Cool gray-blue mist (`#E8EEF2` → `#F4F7F9`) |
| `--bg-panel` | Side instruments | Near-white with slight blue (`#FBFCFD`) |
| `--ink` | Primary text | Deep ink (`#0F1C24`) |
| `--ink-muted` | Secondary | Slate (`#5A6B76`) |
| `--line` | Grid, borders | Low-contrast steel (`#C5D0D8`) |
| `--brand` | Prism identity | **Signal teal** (`#0F766E`–`#115E59`) — not purple |
| `--route` | Dependency paths / navigation | Bright teal/cyan line |
| `--risk` | Blast radius / hotspots | Amber → coral (`#D97706` → `#E11D48` at extreme) |
| `--safe` | Healthy / covered | Soft green (`#059669`) |
| `--debt` | Tech debt layer | Dusty ochre |
| `--ownership` | Teams/people layer | Indigo-steel (desaturated, not candy purple) |

**Rules**

- One accent family (teal) for brand + primary CTA  
- Risk/debt use **semantic hues**, never decorate everything in brand color  
- No glow stacks, no rainbow gradients on buttons  

---

## 5. Typography

Expressive but engineered (avoid Inter / Roboto / Arial as brand faces).

| Role | Direction | Example candidates |
|---|---|---|
| Display / brand | Geometric, slightly sharp | **Satoshi**, **General Sans**, or **Switzer** |
| UI body | Clean grotesque | Same family at regular weights |
| Mono / code landmarks | Readable coding face | **IBM Plex Mono**, **JetBrains Mono**, or **Fragment Mono** |
| Map labels | UI + mono mix | Feature names in sans; file paths in mono |

**Scale:** comfortable IDE density; Map labels shrink by zoom level (cartographic hierarchy).

---

## 6. Layout & components (design system shape)

### Principles

1. **Map is the product** — first viewport = brand + map terrain + one clear action  
2. **Instruments, not dashboards** — side panel = one job (search, layers, selection detail)  
3. **No card soup** — cards only for interactive selection sheets  
4. **Layers over widgets** — health/risk appear as map overlays, not KPI strips in the hero  
5. **Motion with purpose** — camera ease on focus, path draw for routes, layer crossfade (2–3 motions)

### Core components (to build in `@repo-prism/ui`)

| Component | Purpose |
|---|---|
| `MapCanvas` | React Flow shell + basemap atmosphere |
| `ZoomRail` | Repo → package → feature → file → symbol |
| `LayerToggles` | Architecture / deps / risk / debt / ownership… |
| `RouteLine` | Dependency / feature route rendering |
| `BlastHalo` | Impact radius overlay |
| `LandmarkPin` | Bookmarks / entrypoints |
| `Inspector` | Selection detail (symbol, owners, tests) |
| `CommandSearch` | Spatial search (features, files, symbols) |
| `SignalBar` | Thin status: index state, health sparkline |
| `DenseList` | Explorer lists without card chrome |

### Shape language

- Radius: **6–10px** controls; Map nodes slightly tighter  
- Borders: 1px hairlines; avoid heavy shadows  
- Elevation: one soft level max for floating inspector  
- Icons: stroke, geometric, 1.5–2px — map legend style  

---

## 7. Motion

| Motion | Use |
|---|---|
| Camera ease | Focus node / feature |
| Path stroke | `dependency_route` / navigation |
| Layer fade | Toggle Map views |
| Halo pulse (subtle) | Blast radius appear — once, not infinite glow |

No confetti, no ambient particle networks.

---

## 8. Surfaces

| Surface | Vibe application |
|---|---|
| Playground | Full Signal Chart — brand showcase |
| VS Code / Cursor | Compress chrome; inherit IDE bg where sensible; keep teal signal + overlays |
| CLI | Ink + teal ANSI sparingly; tables over banners |
| Docs | Light chart atmosphere; Map screenshots as proof |

---

## 9. Anti-patterns (explicit)

- Purple / indigo SaaS gradients  
- Warm cream + terracotta “AI editorial” look  
- Newspaper broadsheet dense rules  
- Pill clusters, stat strips in the hero  
- Emoji as UI  
- Glassmorphism + multi-shadow stacks  
- Chat-first layouts  

---

## 10. Delivery milestones

| When | Design work |
|---|---|
| M-001 | Tokens stub / CSS variables file (optional) |
| M-017 | Map visual model aligns with layers |
| M-018 | **Signal Chart v1** in playground (`@repo-prism/ui`) |
| M-019 | Layer legends + overlay styling |
| M-030/031 | IDE webview adaptation |
| M-038 | Docs site uses same tokens |

---

## 11. Success test

1. Remove the word “Prism” from the Map chrome — the **teal chart + spatial map** should still feel like the same product.  
2. First viewport should answer: *Where am I in this repo?* — not *Here are 8 metrics.*
