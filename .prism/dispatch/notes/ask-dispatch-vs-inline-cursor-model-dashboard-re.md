# ask-dispatch-vs-inline-cursor-model-dashboard-re

Three Console / Dispatch fixes on the M-068 line (owner 2026-09-05).

## 1) Always ask dispatch vs inline

**Cause:** `dispatchMode=ask` and the CRITICAL ask block were already correct, but Dispatch `start_job` guidance (`Do not wait to be asked…`, closing line, tool description) told the agent to call `start_job` without waiting — that overrode the ask.

**Fix:** Align server instructions, `start_job` tool description, docs, and Jobs empty-state copy so ask-first wins under `dispatchMode=ask`. No silent auto-dispatch.

**Files:** `packages/mcp-server/src/instructions.ts`, `instructions.test.ts`, `dispatch-registry.ts`, `docs/reference/mcp-tools.md`, `packages/app-shell/src/JobsScreen.tsx`

Console New job compose (`POST /api/jobs`) is still M-069; submitting New job is already an explicit dispatch choice when it lands.

## 2) Cursor model not bare “default”

**Cause:** Cursor worker options pinned `model: { id: "auto" }`, which the SDK often echoed as `default` into `workerModel`. The inspector treated any non-empty string as a real id.

**Fix:** Stop pinning auto; prefer concrete id/name from agent create + stream (`cursorModelId` / `cursorModelFromEvent`). UI labels use real `workerModel` when known; sentinels become `Cursor default` / `Auto` instead of bare `default`.

**Files:** `packages/dispatch/src/worker-options.ts`, `worker-child.ts`, `index.ts`, `run-state.test.ts`, `packages/app-shell/src/jobs-types.ts`, `JobsScreen.test.tsx`

## 3) Dashboard Refresh

**Cause:** ADR-0053 retired Refresh from chrome; owner wants it back next to dashboard filters.

**Fix:** Refresh control on the shared jobs toolbar (lane filters + All repos), Lucide `RefreshCw` + label. Console wiring calls `feed.refresh()` and bumps `reposEpoch` so `/api/repos` re-reads. Same toolbar for all Jobs canvas renderings.

**Files:** `packages/app-shell/src/JobsScreen.tsx`, `jobs-extra.css`, `packages/dispatch-hub/src/dashboard/console-app.tsx`

**Rebuild:** `packages/dispatch-hub/scripts/build-dashboard.ts` must run after UI changes; this worker had no shell and could not bundle `dist/dashboard`.
