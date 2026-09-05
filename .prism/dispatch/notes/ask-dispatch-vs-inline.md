# Ask dispatch vs inline (item 1)

## Root cause

`dispatchMode` already defaults to `ask`, and the CRITICAL block in
`SERVER_INSTRUCTIONS` told agents to offer teammate-or-inline. A later
Dispatch bullet and the closing line contradicted that: “Do not wait to be
asked … call it — the user can stop you” and “For a code change that means
start_job”. The `start_job` tool description likewise said to call for any
change request without waiting. Agents followed the later, louder rule and
silently auto-dispatched.

## Fix

Align instructions, `start_job` description, mcp-tools doc, and Jobs empty
copy so ask (default) wins unless the user already chose, `dispatchMode` is
`auto`/`inline`, or they explicitly asked for a job.

Console `POST /api/jobs` compose (ADR-0053 §4) is still M-069 — not present
to bypass yet; when it ships, submitting New job is an explicit dispatch.
