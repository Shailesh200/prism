# Ready for review badge: amber + not clipped

Job: `ready-for-review-badge-amber-and-not-clipped` (2026-09-05)

## Changes

### Tone: violet → amber
- `packages/app-shell/src/jobs-types.ts` — `jobBadgeTone("needs_review")` returns `"amber"` (with awaiting/blocked/waiting). `paused` stays violet.
- `packages/app-shell/src/jobs-status.test.ts` — expectation updated to amber.
- `packages/dispatch-hub/src/dashboard/intelligence-view.tsx` — Ready for review intel stat uses amber (was violet). Awaiting approval already amber; labels unchanged.
- Console fleet/list badges import `jobBadgeTone` from app-shell; no duplicate mapper.

### Layout: pill not clipped
- `packages/ui/src/primitives.css` — `.prism-badge`: `flex: 0 0 auto`, `width: max-content`, `max-width: none`, `white-space: nowrap`, `box-sizing: border-box` (removed `max-width: 100%` clip).
- `packages/ui/src/badge-css.test.ts` — asserts those layout rules.
- `packages/dispatch-hub/src/dashboard/styles.css` — status column `11rem`; badge inside status and fleet job-list buttons no longer `max-width`/`overflow` clip; wrap still `overflow-x: hidden`.

## Not done here
- No commit. No rebuild (`ui` / dispatch-hub dashboard) — worker has no shell; host should rebuild after typecheck/tests.
