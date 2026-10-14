/**
 * MCP resources for hot orientation reads (M-058 / P-C8).
 *
 * Resources are refreshed on each read after the session index is ready —
 * there is no separate cache to stale.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toMcpError } from "./errors.js";
import type { WorkspaceSession } from "./session.js";
import { serialiseForMcp } from "./tool-registry.js";

export function registerResources(
  server: McpServer,
  session: WorkspaceSession,
): void {
  server.registerResource(
    "dna",
    "prism://dna",
    {
      description:
        "Repository DNA — languages, frameworks, architecture hints (same as repository_overview).",
      mimeType: "application/json",
    },
    async (uri) => {
      const ready = await session.ready();
      if (!ready.ok) throw toMcpError(ready.error);
      const dna = await ready.value.getDna();
      if (!dna.ok) throw toMcpError(dna.error);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: serialiseForMcp(dna.value),
          },
        ],
      };
    },
  );

  server.registerResource(
    "landmarks",
    "prism://landmarks",
    {
      description:
        "Repository landmarks — entrypoints and anchors (same as landmarks tool).",
      mimeType: "application/json",
    },
    async (uri) => {
      const ready = await session.ready();
      if (!ready.ok) throw toMcpError(ready.error);
      const result = ready.value.listLandmarks();
      if (!result.ok) throw toMcpError(result.error);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: serialiseForMcp(result.value),
          },
        ],
      };
    },
  );

  server.registerResource(
    "agents-md",
    "prism://agents-md",
    {
      description:
        "Living AGENTS.md — features, import cycles, test locations, git ownership, composed from the index (same content as `prism agents-md generate`). Regenerates the file on each read.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const ready = await session.ready();
      if (!ready.ok) throw toMcpError(ready.error);
      const generated = await ready.value.generateAgentsMd();
      if (!generated.ok) throw toMcpError(generated.error);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: generated.value.content,
          },
        ],
      };
    },
  );
}
