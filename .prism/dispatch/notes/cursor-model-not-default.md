# Cursor agent shows a real model, not "default" (item 2)

## Root cause

Two stacked issues:

1. `cursorAgentOptions` pinned `model: { id: "auto" }`. The Cursor SDK often
   echoed that back as `default`, which was stored on the job as `workerModel`.
2. `jobModelLabel` / `formatWorkerModel` treated any non-empty `workerModel` as
   a real id, so the inspector showed the bare word `default`.

Snapshot / `use-jobs` already forwarded `workerModel`; the gap was capture +
labeling, not the hub pipeline.

## Fix

- Omit the forced model in Cursor worker options so the host selection applies.
- Prefer a concrete id/name from the agent (and stream) over `default`/`auto`.
- Label sentinels as `Cursor default` / `Auto`; show formatted real ids when
  known. Do not invent model names.
