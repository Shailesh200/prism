# Key pages

## /dashboard Timeline (default)
Entry: `packages/dispatch-hub/src/dashboard/fleet-views.tsx` (`TimelineView`)
Dependencies:
- `packages/dispatch-hub/src/dashboard/fleet.ts` (axis, `timelineLanesForRepo`, bar geometry)
- `packages/ui/src/ChartPrimitives.tsx` (`GanttRow`)
- `packages/ui/src/Badge.tsx`, `Button.tsx`, `Truncate`, `HoverTip`
- `packages/dispatch-hub/src/dashboard/styles.css` (`.fleet-timeline`, `.fleet-bar`, `.fleet-now`)
- Lock: `plans/mockups/CONSOLE_FLEET.md` §4

## /attention (Attention inbox)
Entry: `packages/dispatch-hub/src/dashboard/console-app.tsx` (AttentionPanel)
Dependencies:
- `packages/ui/src/Button.tsx`
- `packages/ui/src/Badge.tsx`
- `packages/ui/src/EmptyState.tsx`
- `packages/app-shell/src/jobs-types.ts` (jobDisplayLabel, jobBadgeTone)
- `packages/dispatch-hub/src/dashboard/styles.css` (`.attention-card`)

Current defect: `.attention-card__actions .prism-btn { flex: 1 1 auto; min-width: 7rem; }` stretches Start anyway / Cancel / Open job into huge equal-width bars.

## /dashboard Focus inspector
Entry: `packages/app-shell/src/JobsScreen.tsx`
Dependencies:
- `packages/ui/src/Drawer.tsx`
- `packages/ui/src/Button.tsx`
- `packages/ui/src/Textarea.tsx`
- `packages/ui/src/Badge.tsx`
- `packages/app-shell/src/jobs-extra.css` (`.job-brief`, `.job-verify`)
- `packages/dispatch-hub/src/dashboard/console-app.tsx` (hosts JobsScreen)

Current defects:
- Save brief uses `size="sm"` but still looks oversized in the drawer footer context; actions should hug bottom-right.
- Checks failed concatenates `lastActivity — verificationDetail` into one wrapping red paragraph (command + CSS list + parenthetical).

## /dashboard Compose (New job)
Entry: `packages/dispatch-hub/src/dashboard/compose-drawer.tsx`
Dependencies:
- `packages/ui/src/Drawer.tsx` (footer slot)
- `packages/dispatch-hub/src/dashboard/styles.css` (`.compose__foot`)
