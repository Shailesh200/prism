# @repo-prism/dispatch-auth

OAuth broker handlers for Prism Dispatch (ADR-0036). Mounted on the public
website at `/oauth/*` and served as **https://auth.prismhq.in**.

Client ids and secrets stay in Vercel env (`PRISM_AUTH_*`). They never ship in
`@repo-prism/mcp-server`. User tokens are sealed for ~2 minutes, redeemed by
the local MCP, and stored in the OS keychain — not in this service.
