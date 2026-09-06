# Attention cards: inline Start / Resume / Pause / Cancel

## Change

Attention inbox cards expose status-gated job controls on the same tab, wired
through the shared `runJobControl` helper → `feed.port.control` → hub
`job_control` (same path as Focus / Jobs).

| Status | Inline actions |
|---|---|
| `needs_confirm` | Start anyway (primary), Cancel (danger), Open job |
| `waiting_on_you` / `paused` | Resume (primary), Cancel (danger), Open job |
| live (if shown) | Pause (secondary), Cancel, Open job |

Open job opens a Focus panel with `JobsScreen` using the same `runJobControl`,
so Focus Resume also hits hub control and toasts success or the error (owner
report: Resume appeared to do nothing).

## Files

- `packages/dispatch-hub/src/dashboard/console-app.tsx`
- `packages/dispatch-hub/src/dashboard/attention.ts` (+ test)
- `packages/dispatch-hub/src/dashboard/router.ts`
- `packages/dispatch-hub/src/dashboard/styles.css`
- `packages/dispatch-hub/src/dashboard/console.test.ts`
- `packages/app-shell/src/JobsScreen.tsx` — Resume uses primary button class
- `packages/ui` — Button / Badge primitives
- `packages/app-shell` — `jobBadgeTone`

Dashboard rebuild left to Prism after stop.
