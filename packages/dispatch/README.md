# @repo-prism/dispatch

Prism Dispatch: jobs, memories, OAuth drivers, and start-my-day briefings.

The MCP server (`@repo-prism/mcp-server`) is the only surface that calls this
package. `@repo-prism/core` must not import it. Intelligence analysis stays on
Core; Dispatch is a second façade for teammate workflow.

State lives under `.prism/dispatch/` (gitignored). User OAuth tokens go in the OS
keychain, with a `0600` fallback file only when keychain is unavailable. Connect
uses the Prism Auth broker (`https://auth.prismhq.in`); users grant in the
browser (Cursor: Authenticate; Claude: auth page) and never paste client ids.
Local Cursor workers sign in the same way via `init` / first `start_job`
(`Cursor.auth.login`); the minted key is not written to mcp.json.

Workers run in a detached child process per job, each in its own git worktree.
Live activity and finished/failed results are stored under
`.prism/dispatch/runs/` and spoken through `list_jobs` / start-my-day
(ADR-0040). Default parallel cap is one job. Job agents do not attach Prism
MCP; Prism worktrees symlink the host `node_modules` (ADR-0041).
