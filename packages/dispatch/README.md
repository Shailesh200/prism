# @repo-prism/dispatch

Prism Dispatch: jobs, memories, OAuth drivers, and start-my-day briefings.

The MCP server (`@repo-prism/mcp-server`) is the only surface that calls this
package. `@repo-prism/core` must not import it. Intelligence analysis stays on
Core; Dispatch is a second façade for teammate workflow.

State lives under `.prism/dispatch/` (gitignored). User OAuth tokens go in the OS
keychain, with a `0600` fallback file only when keychain is unavailable. Connect
uses the Prism Auth broker (`https://auth.prismhq.in`); users grant in the
browser (Cursor: Authenticate; Claude: auth page) and never paste client ids.
