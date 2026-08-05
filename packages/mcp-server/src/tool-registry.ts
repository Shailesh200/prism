/**
 * One place to declare a tool: name, description, input schema, Core call
 * (M-026).
 *
 * Everything an agent sees about a tool is in its definition, and everything
 * that happens around the call — opening the workspace, mapping errors,
 * serialising the result — happens here once. A tool that needs to do any of
 * that itself is a sign the framework is wrong, not the tool.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PrismWorkspace } from "@repo-prism/core";
import type { PrismError, Result } from "@repo-prism/shared";
import type { ZodRawShape, z } from "zod";
import { toMcpError, toMcpErrorFromThrown } from "./errors.js";
import type { WorkspaceSession } from "./session.js";

/**
 * What a tool gets to work with. The root is here because path arguments have
 * to be validated against it before they reach Core (`paths.ts`), and a tool
 * that had to ask for it separately would eventually forget to.
 */
export type ToolContext = {
  readonly workspace: PrismWorkspace;
  readonly workspaceRoot: string;
};

/**
 * A tool is a description plus a Core call. The `call` returns Core's `Result`
 * untouched — DTOs reach the agent exactly as `@repo-prism/shared` defines them,
 * because the MCP contract *is* the Core contract (ADR-0004). List tools wrap
 * theirs in the `BoundedList` envelope from `limits.ts`; the items inside stay
 * unmodified.
 */
export type ToolDefinition<Shape extends ZodRawShape = ZodRawShape> = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Shape;
  /** Hint for agents: no Prism tool ever writes to the repository. */
  readonly readOnly?: boolean;
  call(
    context: ToolContext,
    args: z.objectOutputType<Shape, z.ZodTypeAny>,
  ): Promise<Result<unknown, PrismError>>;
};

/** Preserves the shape's type through the definition, unlike a bare literal. */
export function defineTool<Shape extends ZodRawShape>(
  definition: ToolDefinition<Shape>,
): ToolDefinition<Shape> {
  return definition;
}

/**
 * Register every tool against the server, each wrapped in the same lifecycle:
 * open the workspace lazily, call Core, translate failure, serialise success.
 */
export function registerTools(
  server: McpServer,
  session: WorkspaceSession,
  tools: readonly ToolDefinition<never>[],
  workspaceRoot: string,
): void {
  for (const tool of tools as readonly ToolDefinition[]) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly ?? true,
          openWorldHint: false,
        },
      },
      // The SDK has already validated `args` against `inputSchema` by here.
      async (args: unknown) => {
        const ready = await session.ready();
        if (!ready.ok) throw toMcpError(ready.error);

        let result: Result<unknown, PrismError>;
        try {
          result = await tool.call(
            { workspace: ready.value, workspaceRoot },
            args as Parameters<typeof tool.call>[1],
          );
        } catch (cause) {
          throw toMcpErrorFromThrown(cause);
        }

        if (!result.ok) throw toMcpError(result.error);
        return {
          content: [{ type: "text" as const, text: serialise(result.value) }],
        };
      },
    );
  }
}

/**
 * Pretty-printed so a human reading an agent transcript can follow it. Prism's
 * reports are read by people at least as often as by machines.
 */
function serialise(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}
