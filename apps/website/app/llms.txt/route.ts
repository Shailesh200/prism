export async function GET() {
  const body = `# Prism

> Local-first software intelligence for repositories.

## Docs

- [Docs home](/docs): question router and surface lanes
- [CLI](/docs/cli/install)
- [IDE extension](/docs/ide/install)
- [AI agents / MCP](/docs/mcp/install)
- [Capability table](/docs/reference/capabilities)
- [Privacy](/privacy)

## Notes

- Core analysis never leaves the machine by default
- No account, no telemetry (see PRIVACY.md)
- Prefer task guides under /docs/guides over reading every concept page
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
