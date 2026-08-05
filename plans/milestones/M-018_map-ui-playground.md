# M-018 — Repository Map UI (Playground)

| Field | Value |
|---|---|
| Branch | `milestone/M-018-map-ui-playground` |
| Status | Verified |
| Depends on | M-017 |
| Unlocks | M-019, M-030 |
| Packages | `@repo-prism/ui`, `apps/playground` |

## Goal

Ship an interactive Repository Map in the playground app using React Flow (or chosen library), consuming `@repo-prism/core` map model—**no IDE required**.

## In Scope

- Playground app: open fixture / local path (dev)
- Pan/zoom, node selection, basic search
- Bookmarks UI
- Shared `@repo-prism/ui` map component extractable for VS Code webview later
- At least 2–3 intentional motions (camera ease, selection highlight, layer fade)

## Out of Scope

- All advanced layers (M-019)
- VS Code webview packaging (M-030+)

## Definition of Done

- [x] Playground runs via `bun --filter @repo-prism/playground dev`
- [x] Map renders fixture with feature-first view
- [x] Component lives in `@repo-prism/ui` for reuse
- [x] Verify + PROGRESS + owner approval

## Deferred (revisit after features)

- Treemap drill / Highcharts transition animation polish
- Further File-zoom density UX refinements

## Verification

Typecheck · Lint · Unit (UI logic) · Build · Manual playground checklist · Playwright smoke optional
