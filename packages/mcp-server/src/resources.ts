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
        "Repository DNA — languages, frameworks, architecture hints (same as repository_dna).",
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
    "health",
    "prism://health",
    {
      description:
        "Repository health score and factors (same as repository_health).",
      mimeType: "application/json",
    },
    async (uri) => {
      const ready = await session.ready();
      if (!ready.ok) throw toMcpError(ready.error);
      const health = await ready.value.getHealth();
      if (!health.ok) throw toMcpError(health.error);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: serialiseForMcp(health.value),
          },
        ],
      };
    },
  );
}
