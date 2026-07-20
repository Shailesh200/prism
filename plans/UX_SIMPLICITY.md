# Prism — Simplicity Principles (understandable + useful)

## Problem we’re solving

Powerful graphs are easy to make *impressive* and hard to make *obvious*.  
If a user opens **Repository Map** and thinks “cool picture — now what?”, the product failed.

## Core idea

**One job per screen. Selection unlocks the next job.**

| Screen | Job (one sentence) | User should do |
|---|---|---|
| Repository Map | **Orient & go somewhere** in the repo | Search or click a region → open / inspect |
| Blast Radius | **See what breaks if this changes** | Pick a file/symbol → read affected list |
| Health / Layers | **See where the pain is** | Toggle one concern (debt/risk) → click hotspot |
| Code Explorer | **Understand this thing** | From selection: usages, tests, owners |
| CLI / MCP | **Same jobs, for scripts/agents** | Same nouns: map, health, blast-radius |

If a control doesn’t serve that job, it doesn’t ship in v1 of that screen.

---

## Repository Map — what it’s for (plain language)

The Map is **not** a dashboard and **not** a pretty graph to admire.

It is a **spatial file picker + orientation tool**:

1. **See the territory** — “This repo has Auth, Billing, API, UI…”  
2. **Go to a place** — click Billing → jump to that code / list files  
3. **Ask a follow-up** — with Billing selected: *See impact* / *Related tests*

### Default view (v1 — keep dumb)

- Only **Features** (big regions) + weak dependency hints  
- **No** 8 layer toggles on first paint  
- Layers live behind **“Views”** (one active view at a time)

### Always-visible affordances

| Affordance | Copy example |
|---|---|
| Search | “Find a feature or file…” |
| Hint (first run) | “Click a region to inspect it” |
| Primary after select | **Open** · **See impact** |
| Secondary | Bookmark · Copy path |

### Anti-patterns

- Showing risk + debt + ownership + coverage at once  
- Stat strips / health gauges competing with the Map  
- Requiring the user to understand graph theory  

---

## Progressive disclosure ladder

```text
Level 0  Open Map → features only + search
Level 1  Select feature → inspector (files, Open, See impact)
Level 2  Views menu → Dependencies OR Risk OR Debt (one at a time)
Level 3  Power: routes, bookmarks, landmarks
```

Agents/CLI can use Level 2–3 immediately; humans start at 0–1.

---

## Complexity budget

- **≤ 1** primary canvas  
- **≤ 1** inspector panel  
- **≤ 3** persistent top actions (Search, Views, Reindex)  
- **≤ 2** CTAs after selection  
- New metrics only as **map coloring**, not new panels  

---

## Success metrics (UX)

- New user can answer in &lt; 30s: “What are the main parts of this repo?”  
- From Map, reach a file in editor in **≤ 2 clicks**  
- “See impact” discoverable without docs  
- Users never ask “what do I do on this screen?” in first-run tests  

---

## Mockup locking process

1. Lock **one** shell (chrome + panels)  
2. Lock screens **one by one** against that shell  
3. Reject mockups that introduce a second visual language  
4. Record locked assets in `plans/mockups/LOCKED.md`
