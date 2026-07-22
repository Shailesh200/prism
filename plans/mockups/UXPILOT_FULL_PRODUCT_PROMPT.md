# UXPilot — Complete Prism product UI (single prompt)

> Paste the **Prompt** block below into [UXPilot](https://uxpilot.ai) as one generation request.  
> Attach brand reference if the tool allows: `plans/mockups/logo/exports/prism-mark-teal-512.png` (faceted teal “P” — do not redesign).  
> Sources: [`../PRD.md`](../PRD.md) · [`DESIGN.md`](./DESIGN.md) · [`../UX_SIMPLICITY.md`](../UX_SIMPLICITY.md) · [`LOCKED.md`](./LOCKED.md)

---

## Prompt (copy everything between the lines)

```text
Design a complete multi-screen desktop product UI for PRISM — a local-first Software Intelligence Engine (NOT an AI chat app, NOT a SaaS dashboard). Vision: “Google Maps + Engineering Intelligence for software repositories.” Offline, private, instrument-grade. Generate a cohesive product system: shared shell + all primary screens below in one consistent visual language.

═══════════════════════════════════════
PRODUCT (from PRD)
═══════════════════════════════════════
Prism helps developers and AI agents understand, navigate, and safely change any code repository. Humans use VS Code / Cursor / Playground. Agents use MCP. CLI for CI. All surfaces share one Core — UI never invents analysis.

Primary human jobs (one job per screen):
1) Repository Map — Orient & go somewhere in the repo
2) Blast Radius — See what breaks if this changes
3) Health / Layers view — See where the pain is (one concern at a time)
4) Code Explorer — Understand this selected thing (usages, tests, owners)
5) DNA / Intelligence — Profile the stack (domains, frameworks, personas)
6) Safe Delete / Rename — Change safely with a clear risk report
7) Insights — Ranked hotspots with evidence (secondary, calm)

Also design (same system, lighter chrome):
8) CLI terminal mock — human-readable `prism health` / `prism blast-radius` output in a clean terminal window (not the main app shell)
9) MCP / Agent panel sketch — tool list + JSON result card for `blast_radius` (side panel style, not chat bubbles)

═══════════════════════════════════════
LOCKED DESIGN SYSTEM — “SIGNAL CHART”
═══════════════════════════════════════
Theme: light-first, cartographic, calm, instrument-grade (like a precision map / aviation chart — not neon, not glassmorphic, not “AI purple”).

Colors (use EXACTLY):
- Brand / primary teal: #0F766E
- Brand strong: #115E59
- On brand (text on teal): #FFFFFF
- Ink: #0F1C24
- Ink muted: #5A6B76
- Line / borders: #C5D0D8
- Panel: #FBFCFD
- Canvas mist: #E8EEF2 → #F3F7F9 (soft atmospheric gradient for map area)
- Tile: #F3F7F9
- Risk amber (ONLY on impact/risk screens): #D97706
- Safe green (sparingly): #059669
- Dark chrome (ONLY for IDE frame chrome if shown): #1A2330

Typography:
- UI / brand: Satoshi (or geometric sans like General Sans / Switzer) — NOT Inter, Roboto, Arial
- Paths / code: IBM Plex Mono (or JetBrains Mono)
- Comfortable IDE density; no giant marketing headlines on product screens

Logo / brand:
- Top-left: faceted geometric crystalline “P” mark in solid teal #0F766E + wordmark “Prism” in ink #0F1C24
- Do NOT redesign, round, simplify, or recolor the mark. If no logo file is attached, draw a sharp faceted P with thin negative-space cuts and a pointed stem tip — still solid teal.

Layout platform: Desktop web / IDE webview, 1440×900 (16:9). ~24px page rhythm. Corner radius modest (6–12px). No pill clusters, no emoji, no multi-layer shadows, no glow.

═══════════════════════════════════════
SHARED APP SHELL (every product screen)
═══════════════════════════════════════
ONE locked shell for screens 1–7:

TOP BAR — 56px, panel #FBFCFD, hairline bottom border:
- Left: faceted P mark + “Prism”
- Center: large search field placeholder “Find a feature or file…”
- Right persistent actions ONLY: “Views” · “Reindex” (≤3 top actions total including search)
- Optional quiet status: “Indexed · offline” in muted ink

MAIN: exactly ONE primary canvas (the screen’s job)
RIGHT: Inspector panel ~312px for selection details
NO competing KPI hero strips, NO stats row above the map, NO chat sidebar

After selection, CTAs only:
- Primary filled teal button: “Open”
- Secondary outline teal: “See impact”
Secondary quiet actions: Bookmark · Copy path

Zoom altitude control (Map-related screens): vertical or bottom rail with levels:
Repo · Package · Feature · File · Symbol — active level filled teal; others muted. Feature emphasized on Map default.

Progressive disclosure:
- Level 0: features + search only
- Level 1: selection → inspector
- Level 2: Views menu opens ONE layer (Dependencies OR Risk OR Debt) — never all layers at once
- Level 3: routes, bookmarks, landmarks, command palette (⌘K)

Complexity budget: ≤1 canvas · ≤1 inspector · ≤3 top actions · ≤2 CTAs after select.

═══════════════════════════════════════
SCREENS TO GENERATE (complete product)
═══════════════════════════════════════

SCREEN A — Repository Map (DEFAULT / HERO)
Job: Orient & go somewhere.
- Feature-first map: large soft rounded regions labeled Auth, Billing, API, UI, Data, Jobs with “N files”
- One region SELECTED (Billing): stronger teal fill/border, slightly elevated
- Only 2–3 subtle curved dependency routes in muted teal — NEVER spaghetti / hairball
- Soft mist canvas background (cartographic atmosphere), not flat white void
- Bottom or side zoom rail: Feature active
- Inspector right: “Billing” · short description · file list · Open + See impact
- First-run hint (subtle): “Click a region to inspect it”
- Views closed by default (no 8 layer toggles on first paint)

SCREEN B — Map File Density (File zoom)
Job: See where code mass lives.
- Same shell; zoom rail on File
- Squarified treemap of folders/files; area ∝ file count
- Distinct soft shades for folders vs file types (TS teal, tests green-safe, config slate, md mist) — still in Signal Chart family, not rainbow
- Breadcrumb: Repository / packages / ui / src
- Tooltip on hover: filename once + mono path + type chip (no duplicate titles)
- Inspector: selected file path + Open

SCREEN C — Blast Radius
Job: See what breaks if this changes.
- Same shell; canvas shows impact graph or structured impact map from a selected symbol “chargeCustomer”
- Risk amber #D97706 used ONLY here for risk score chip / affected edges — sparingly
- Inspector or main panel: risk 72 · 18 dependent files · 4 features · 6 tests likely affected · short route “billing → api → webhooks”
- CTAs: Open · Copy report (outline). No chat UI.

SCREEN D — Health + single Layer view
Job: See where the pain is.
- Same shell; Views menu open with ONE active: “Debt” (or Risk)
- Map regions tinted by that single concern; legend for that layer only
- Quiet health readout in inspector: 84/100 + 3 factors (architecture stable · debt moderate · test coupling good) — NOT a dashboard of gauges fighting the map

SCREEN E — Code Explorer
Job: Understand this thing.
- Same shell; canvas or split list for “chargeCustomer”
- Sections: Usages · Related tests · Related features · Owners (calm lists, mono paths)
- Inspector mirrors selection; Open + See impact

SCREEN F — Repository DNA
Job: Profile the stack.
- Same shell; calm profile cards (not marketing): Domains (Frontend, Backend) · Frameworks · Personas (FE, BE) · Architecture notes
- Still use Signal Chart tokens; no illustration clutter

SCREEN G — Safe Delete report
Job: Change safely.
- Same shell; report layout for deleting “src/legacy/oldUtil.ts”
- Clear verdict (Safe / Risky) · blockers list · dependents · suggested tests
- Risk amber only if Risky; otherwise teal/ink
- CTA: Copy report · Open file

SCREEN H — Insights (secondary)
Job: Ranked engineering insights.
- Same shell; ranked list “Hotspots” with evidence links into map/files
- Sparse, scannable; no chart junk

SCREEN I — IDE embedding (VS Code / Cursor)
- Same Map screen (A) framed inside a subtle dark IDE chrome #1A2330 with activity bar + tab “Prism”
- Product UI inside remains LIGHT Signal Chart (do not dark-theme the whole product)

SCREEN J — CLI + MCP (companion, not main shell)
- Left: terminal window with Prism CLI human output for health + blast-radius (monospace, teal accent sparingly)
- Right: MCP tool cards listing repository_map, repository_health, blast_radius, safe_delete with a sample JSON result panel
- Same brand mark; no chat bubbles; tool-call aesthetic

═══════════════════════════════════════
INTERACTION / MOTION (show in mockups)
═══════════════════════════════════════
- Selection highlight on map regions
- Soft camera / focus ease when selecting
- Layer fade when Views switches (one layer)
- Hover tooltip elevation above labels
- Respect calm motion — no bounce, no neon pulses

═══════════════════════════════════════
STRICT ANTI-PATTERNS (reject if present)
═══════════════════════════════════════
- Purple / violet / indigo gradients or “AI startup” look
- Chat / Copilot conversation UI as the product center
- KPI hero strips, stat cards in the first viewport of the Map
- Showing risk + debt + ownership + coverage all at once
- Graph spaghetti / hairball
- Glassmorphism stacks, neon glow, emoji decoration
- Inter / Roboto / Arial as primary UI font
- Redesigning the Prism mark
- Dark mode as the default product theme
- Multiple competing visual languages across screens

═══════════════════════════════════════
DELIVERABLE
═══════════════════════════════════════
Produce a unified desktop UI kit / multi-screen mockup set for the complete Prism product using the shared shell, covering screens A–J above. High fidelity, light Signal Chart aesthetic, production-quality density suitable for an engineering tool (Linear / Vercel quiet-luxury for engineers, but cartographic). Every screen must answer: “What do I do next?” without a manual.
```

---

## How to use in UXPilot

1. New project / generate → paste the Prompt block.  
2. Attach `prism-mark-teal-512.png` if file upload is available.  
3. Ask for **desktop 1440×900** and **multi-screen / full product**.  
4. If the tool caps length, keep the DESIGN SYSTEM + SHARED SHELL + SCREENS A–D first, then regenerate E–J with “continue same shell.”  
5. Reject any output that violates STRICT ANTI-PATTERNS; regenerate with those lines emphasized.

## Optional follow-up prompt (if UXPilot splits runs)

```text
Continue the Prism Signal Chart system from the previous screens. Same shell, colors (#0F766E teal, #0F1C24 ink, #E8EEF2–#F3F7F9 canvas), Satoshi + IBM Plex Mono. Generate screens E–J only: Code Explorer, DNA, Safe Delete, Insights, IDE embedding, CLI+MCP companion. No purple, no chat UI, no KPI strips.
```
