# Prism — Locked Brand & Design System

> Status: **LOCKED** (2026-07-20). Brand mark/lockups unchanged.  
> **Product UI theme relocked 2026-07-22 to UXPilot dark** — see [ADR-0014](../adr/0014-uxpilot-dark-product-ui.md). App surfaces use the dark tokens in `packages/ui/src/tokens.css` (navy, cyan `#00C2C2`, violet `#6C63FF`, Inter + JetBrains Mono). Screens: [`screens/SPECS.md`](./screens/SPECS.md) + [`screens/html/`](./screens/html/).

## What is locked

| Item | Status | Canonical |
|---|---|---|
| Brand mark (faceted P) | **Locked** | `logo/prism-mark.png` + `logo/exports/prism-mark-*` |
| Horizontal lockup (light) | **Locked** | `logo/prism-lockup.png` + `logo/exports/prism-lockup-light-*` |
| Horizontal lockup (dark) | **Locked** | `logo/prism-lockup-dark.png` + `logo/exports/prism-lockup-dark-*` |
| Design system (Signal Chart) | **Locked** | [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) + [`DESIGN.md`](./DESIGN.md) tokens |
| UI screen mockups | Deferred | Generate later only if needed for M-018+ |

## App-ready brand files

All masters are **transparent PNG**.

### Mark

| File | Use |
|---|---|
| `logo/prism-mark.png` | Master mark (teal, transparent) |
| `logo/exports/prism-mark-teal-{512,256,128,64,32,16}.png` | App icons / favicon |
| `logo/exports/prism-mark-ink-*.png` | Light UI / print |
| `logo/exports/prism-mark-light-*.png` | Dark chrome |
| `logo/exports/prism-mark-white-*.png` | Dark backgrounds |

### Lockups

| File | Use |
|---|---|
| `logo/prism-lockup.png` | Headers, docs (light) |
| `logo/exports/prism-lockup-light-{512,320,240,160}.png` | Sized light lockups |
| `logo/prism-lockup-dark.png` | IDE / dark headers |
| `logo/exports/prism-lockup-dark-{512,320,240,160}.png` | Sized dark lockups |

### Regen sources (do not ship)

- `logo/prism-mark-source-white.png`
- `logo/prism-lockup-source-white.png`
- `logo/prism-lockup-dark-source.png`
- Script: `python3 logo/generate_locked_variants.py` (marks only)

## Design system (locked direction)

See [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md). Summary:

- Theme: **Signal Chart** — cartographic, calm, instrument-grade  
- Brand: `#0F766E` · Ink `#0F1C24` · Canvas `#E8EEF2`–`#F3F7F9`  
- Shell: Top bar (mark + Prism · Search · Views · Reindex) → Map → Inspector  
- CTAs: **Open** + **See impact** only  
- Avoid: purple, glow, AI-chat UI, KPI hero strips  

Stitch / token source: [`DESIGN.md`](./DESIGN.md)

## Gallery

View locked assets: [`gallery.html`](./gallery.html)

## Deferred (not blocking)

- Stacked lockup  
- Repository Map / Blast Radius / Risk / VS Code PNG mockups  
- Optional SVG conversion of the mark (later, if needed for production)
