# Network failure logs check

## Finding

`packages/dispatch/src/worker-child.ts` had a path where a network failure
never reached the job console.

`isNetworkFailureMessage` / `publicWorkerError` / `networkFailureSpeak`
(`packages/dispatch/src/job-voice.ts`) exist specifically because the Cursor
SDK reports failed HTTPS calls (VPN/proxy TLS interception, offline, etc.) as
"Network request failed" — see the comment in `system-ca.ts`. The earliest
place that error can surface is the `await import("@cursor/sdk")` call in
`worker-child.ts`.

That catch block (previously) only patched `run.json`'s `errorMessage` with
the friendly `publicWorkerError(detail)` string — it never called `logLine`
to append to the run log (`run-log.ts` / `appendRunLog`). The sibling catch
block further down (the outer `try/catch` around `agent.send`/`wait`) does
call `logLine("failed", detail)` before patching.

Effect: if the SDK import itself failed (e.g. a network error during module
resolution/init), the job would end in `phase: "failed"` with a sensible
error message on the job card, but `job_logs` / the Jobs console would show
"No console output yet." (`jobLogsSpeak` in `job-voice.ts`) — the console
telling a different, less true story than the job status, which is exactly
what commit 77d6b78 ("tell the truth about an empty console") was fixing
elsewhere.

## Fix

Added `await logLine("failed", detail);` in the `@cursor/sdk` import catch
block in `worker-child.ts`, mirroring the outer catch block, so the raw
(unfriendly) failure detail is recorded in the run log even when the SDK
never loaded.

## File changed

- `packages/dispatch/src/worker-child.ts`
