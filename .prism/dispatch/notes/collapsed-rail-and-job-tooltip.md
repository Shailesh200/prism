# Collapsed rail icon + compact job tooltip

M-068 Console chrome lived as host WIP on the same commit as this job
branch; the clean worktree lacked the rail/fleet surfaces. Bugfixes are
landed here against those surfaces.

## Bug 1 — Collapsed Attention badge hid lucide icons

**Cause:** In a 52px `.console-rail--collapsed`, the Attention count chip
(`min-width` + `margin-left: auto`) starved the lucide SVG (`flex-shrink: 1`).

**Fix:**
- `.console-rail__item > svg { flex-shrink: 0 }`
- Collapsed badge is an absolute corner chip (top/right), not covering the glyph

## Bug 2 — Job tooltip dumped full PRD

**Cause:** List/drawer rows passed the full `job.prd` into `Truncate` → `HoverTip`.

**Fix:**
- `HoverTip`: optional `detail`; title + `prism-tooltip__body--clamp` (4 lines)
- `Truncate`: optional `heading`
- `fleet-views`: `compactJobPrd()` + `heading={job.title}` (full PRD stays in Focus)

## Key files

- `packages/dispatch-hub/src/dashboard/styles.css` — rail icon/badge
- `packages/dispatch-hub/src/dashboard/fleet-views.tsx` — compact tips
- `packages/ui/src/HoverTip.tsx`, `Truncate.tsx`, `primitives.css`
- Supporting M-068 dashboard/ui pieces needed for those surfaces to typecheck
