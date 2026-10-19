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
import type { DaemonOutcome } from "@repo-prism/daemon";
import type { PrismError, Result } from "@repo-prism/shared";
import { budgetFor, fitToBudget } from "@repo-prism/shared";
import { reportUsage } from "@repo-prism/shared/pulse";
import { z, type ZodRawShape } from "zod";
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
  /** Process env for this server/daemon (session store, prism home, …). */
  readonly env?: NodeJS.ProcessEnv;
};

/** What the agent's own server knows that the daemon does not (its host). */
export type PresentContext = {
  readonly workspaceRoot: string;
  /** This server's env, as the host configured it. */
  readonly env: NodeJS.ProcessEnv;
  /** Tool names this server offers. */
  readonly tools: ReadonlySet<string>;
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
  /**
   * Load this tool upfront in Claude Code instead of behind tool search
   * (`_meta["anthropic/alwaysLoad"]`). Kept to the few tools the hooks name,
   * because each upfront tool costs context every turn. Other hosts ignore it.
   */
  readonly alwaysLoad?: boolean;
  call(
    context: ToolContext,
    args: z.objectOutputType<Shape, z.ZodTypeAny>,
  ): Promise<Result<unknown, PrismError>>;
  /**
   * Shapes a successful answer for this host. Runs in the agent's own server,
   * after `call` (which may have run in the daemon).
   */
  present?(
    value: unknown,
    args: z.objectOutputType<Shape, z.ZodTypeAny>,
    context: PresentContext,
  ): Promise<unknown>;
};

/** Preserves the shape's type through the definition, unlike a bare literal. */
export function defineTool<Shape extends ZodRawShape>(
  definition: ToolDefinition<Shape>,
): ToolDefinition<Shape> {
  return definition;
}

/** Every tool takes a token budget and a paging offset (plan P3). */
export const BUDGET_ARGS = {
  maxTokens: z
    .number()
    .int()
    .min(200)
    .max(12_000)
    .optional()
    .describe(
      "Token budget for this answer; lowest-ranked items are cut first.",
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Skip this many items per list (from a previous `budget.hint`)."),
} as const;

/**
 * The per-tool `_meta` key Claude Code reads to load a tool upfront (Claude
 * Code docs, "Mark a tool to load upfront or stay deferred"). Round 4: with
 * every Prism tool deferred, sessions made no Prism calls at all.
 */
export const ALWAYS_LOAD_META = "anthropic/alwaysLoad";

/**
 * Register every tool against the server, each wrapped in the same lifecycle:
 * open the workspace lazily, call Core, translate failure, serialise success.
 */
export function registerTools(
  server: McpServer,
  session: WorkspaceSession,
  tools: readonly ToolDefinition<never>[],
  workspaceRoot: string | (() => string),
  env: NodeJS.ProcessEnv = process.env,
  /** Ask the daemon first (ADR-0063); `unavailable` falls through to `session`. */
  attach?: (tool: string, args: unknown) => Promise<DaemonOutcome<unknown>>,
): void {
  const resolveRoot = (): string =>
    typeof workspaceRoot === "function" ? workspaceRoot() : workspaceRoot;
  const offered = new Set(tools.map((tool) => tool.name));
  for (const tool of tools as readonly ToolDefinition[]) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: { ...tool.inputSchema, ...BUDGET_ARGS },
        annotations: {
          readOnlyHint: tool.readOnly ?? true,
          openWorldHint: false,
        },
        ...(tool.alwaysLoad ? { _meta: { [ALWAYS_LOAD_META]: true } } : {}),
      },
      // The SDK has already validated `args` against `inputSchema` by here.
      async (rawArgs: unknown) => {
        const started = Date.now();
        const note = (ok: boolean, code?: string) => {
          reportUsage(
            {
              surface: "mcp",
              name: tool.name,
              result: ok ? "ok" : "failed",
              ms: Date.now() - started,
              ...(code ? { code } : {}),
            },
            env,
          );
        };
        const { maxTokens, offset, ...args } = (rawArgs ?? {}) as {
          maxTokens?: number;
          offset?: number;
        } & Record<string, unknown>;
        const attached = await attach?.(tool.name, args);
        let result: Result<unknown, PrismError>;
        let root = resolveRoot();
        if (attached?.kind === "ok") {
          result = { ok: true, value: attached.value };
        } else if (attached?.kind === "error") {
          result = { ok: false, error: attached.error };
        } else {
          const ready = await session.ready();
          if (!ready.ok) {
            note(false, ready.error.code);
            throw toMcpError(ready.error);
          }
          try {
            root = resolveRoot();
            result = await tool.call(
              { workspace: ready.value, workspaceRoot: root, env },
              args as Parameters<typeof tool.call>[1],
            );
          } catch (cause) {
            note(false);
            throw toMcpErrorFromThrown(cause);
          }
        }

        if (!result.ok) {
          note(false, result.error.code);
          throw toMcpError(result.error);
        }
        let value = result.value;
        if (tool.present) {
          try {
            value = await tool.present(
              value,
              args as Parameters<typeof tool.call>[1],
              { workspaceRoot: root, env, tools: offered },
            );
          } catch (cause) {
            note(false);
            throw toMcpErrorFromThrown(cause);
          }
        }
        const fitted = fitToBudget(
          value,
          budgetFor(tool.name, maxTokens),
          offset ?? 0,
        ).value;
        const text = serialiseForMcp(fitted);
        note(true);
        return {
          content: [{ type: "text" as const, text }],
        };
      },
    );
  }
}

/**
 * Fields that change on every call (plan P16): wall-clock times, durations
 * and the budget footer. They go last in every object, so two answers about
 * an unchanged repository share a long identical prefix a host's prompt cache
 * can reuse.
 */
export const VOLATILE_KEYS: ReadonlySet<string> = new Set([
  "generatedAt",
  "collectedAt",
  "checkedAt",
  "indexedAt",
  "indexIndexedAt",
  "durationMs",
  "elapsedMs",
  "budget",
]);

/**
 * Wall-clock "when was this computed" stamps. Only the answer's own
 * (top-level) stamp is kept; nested ones (one per package, per section) say
 * nothing the agent can use and would break the stable prefix mid-answer.
 */
export const CLOCK_KEYS: ReadonlySet<string> = new Set([
  "generatedAt",
  "collectedAt",
  "checkedAt",
]);

function cacheOrdered(value: unknown, depth: number): unknown {
  if (Array.isArray(value))
    return value.map((item) => cacheOrdered(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([key]) => depth === 0 || !CLOCK_KEYS.has(key),
  );
  return Object.fromEntries([
    ...entries
      .filter(([key]) => !VOLATILE_KEYS.has(key))
      .map(([key, child]) => [key, cacheOrdered(child, depth + 1)]),
    ...entries
      .filter(([key]) => VOLATILE_KEYS.has(key))
      .map(([key, child]) => [key, cacheOrdered(child, depth + 1)]),
  ]);
}

/**
 * Compact JSON by default — pretty-printing burns agent context for no gain.
 * Opt in with `PRISM_MCP_PRETTY=1` for human-readable transcripts (M-058 / P-C4).
 * Volatile fields go last in every object and nested clock stamps are
 * dropped (plan P16, CACHE-1/2).
 */
export function serialiseForMcp(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const pretty = env.PRISM_MCP_PRETTY === "1";
  const ordered = cacheOrdered(value ?? null, 0);
  return pretty ? JSON.stringify(ordered, null, 2) : JSON.stringify(ordered);
}
