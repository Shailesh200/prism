# Using Prism with an AI agent

**The MCP server gives an agent real knowledge of your repository instead of
whatever it can infer from the few files in its context window.**

MCP is the Model Context Protocol, a standard way for an AI client to call
external tools. Prism ships an MCP server that exposes its analysis as tools an
agent can call.

For every tool, see the generated [MCP tool reference](../reference/mcp-tools.md).

## Why this is worth doing

An agent asked to change a function sees that function. It does not see the
eleven other places that call it, the test that pins its behaviour, or the fact
that it sits at the centre of a dependency cluster.

Prism answers those questions in one call. The difference in practice is between
an agent that makes a locally correct change and one that knows what the change
will cost.

## Setup

```bash
npm install -g @prism/mcp-server
```

### Cursor

In `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "prism": {
      "command": "prism-mcp",
      "args": ["--workspace", "/absolute/path/to/your/repo"]
    }
  }
}
```

### Claude Desktop

In your MCP configuration:

```json
{
  "mcpServers": {
    "prism": {
      "command": "prism-mcp",
      "args": ["--workspace", "/absolute/path/to/your/repo"]
    }
  }
}
```

Without `--workspace`, the server reads `PRISM_WORKSPACE`, then falls back to
the directory it was started in.

## How the server behaves

**One index, built lazily.** The first tool call that needs an index builds it;
later calls reuse it. Starting the server does no work, so an agent that never
asks a question costs nothing.

**stdio only.** The server speaks over standard input and output, and writes
nothing else to stdout — a stray log line would corrupt the protocol. Diagnostics
go to stderr.

**Every list is bounded.** Tools that return a list accept `limit` and answer
with `totalCount` and `truncated`, so an agent can tell the first 20 of 340 from
all 20 there are. Without that, an agent silently reasons over a truncated list
and concludes the wrong thing.

**Paths are validated.** A path outside the workspace is refused.

## Read-only, deliberately

Every tool is read-only, and no consent-gated capability is exposed. Not
guarded — absent.

An agent cannot give informed consent on your behalf. If a network capability
were reachable from a tool, the agent would use it whenever it judged that
helpful, which is precisely the decision that is supposed to be yours. See
[consent and privacy](../concepts/consent-and-privacy.md).

## Prompts that work well

Concrete beats open-ended. These reliably route to the right tools:

> Before you change `src/auth/session.ts`, use Prism to check what depends on it
> and which tests cover it.

> Use Prism to find where the checkout feature lives, then summarise how it is
> structured.

> Use Prism's engineering health report to find the three files with the highest
> churn and the least test coverage.

> I want to delete `src/legacy/adapter.ts`. Ask Prism what would break.

## When something is missing

If a tool reports that an index is required, the repository has not been indexed
and the build failed — usually a workspace path problem. Run `prism doctor` in
the same directory to see what the engine resolves.

## Related

[MCP tool reference](../reference/mcp-tools.md) · [Consent and privacy](../concepts/consent-and-privacy.md)
