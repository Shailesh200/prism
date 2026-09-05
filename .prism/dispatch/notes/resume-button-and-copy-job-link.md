# Resume on stop + Copy job link

## What changed

1. **Unexpected-stop Resume** — `JobsScreen` now treats `error` (and `paused`) as
   resumable. Failed jobs show brand-styled **Resume** and secondary **Cancel**,
   including beside the red stop copy in Focus. Both call the same hub
   `control("resume"|"cancel")` path as Pause.

2. **Copy link** — Console rows get a ⋮ menu with **Copy link** (Delete moves
   into that menu when Copy is available). Focus header also shows Copy link
   when open. `consoleJobShareUrl` keeps `?token=` and hashes `#/jobs?job=…`
   (optional `repo=`). Toast: “Link copied”.

## Files

- `packages/app-shell/src/JobsScreen.tsx` (+ tests, `jobs-extra.css`, `jobs-types.ts`, `index.ts`)
- `packages/dispatch-hub/src/dashboard/console-app.tsx`, `router.ts`, `console.test.ts`

## Note

Timeline / Board / List fleet canvases are not in this worktree yet (M-070);
Copy link lands on the current Focus accordion rows. Dashboard bundle rebuild
was not run here (no shell); host CI / post-job verify should rebuild app-shell
CSS and the hub dashboard.
