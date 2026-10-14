/**
 * `prism-mcp --daemon` (M-095, ADR-0063).
 *
 * The daemon runs the same tool definitions as this server, so an answer
 * from it is byte-for-byte what the in-process path would have returned.
 */

import { isAbsolute } from "node:path";
import type { PrismWorkspace } from "@repo-prism/core";
import type { DaemonRootRoute, DaemonTool } from "@repo-prism/daemon/server";
import { PrismErrorCode, err, ok, prismError } from "@repo-prism/shared";
import { z } from "zod";
import { daemonBuildId } from "./daemon-attach.js";
import { recordEvent } from "@repo-prism/shared/events";
import type { ToolDefinition } from "./tool-registry.js";
import { TOOLS } from "./tools.js";

export function daemonToolFor(tool: ToolDefinition): DaemonTool {
  const schema = z.object(tool.inputSchema);
  return {
    parseArgs(raw) {
      const parsed = schema.safeParse(raw ?? {});
      return parsed.success
        ? ok(parsed.data)
        : err(
            prismError(
              PrismErrorCode.VALIDATION,
              parsed.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join("; "),
            ),
          );
    },
    call: (context, args) =>
      tool.call(context, args as Parameters<ToolDefinition["call"]>[1]),
  };
}

/** Every tool, opt-in ones included: a client with `extraTools[]` attaches too. */
export function daemonTools(): Map<string, DaemonTool> {
  return new Map(
    (TOOLS as readonly ToolDefinition[]).map((tool) => [
      tool.name,
      daemonToolFor(tool),
    ]),
  );
}

const SessionArgs = z.object({ sessionId: z.string().min(1).optional() });
const ReceiptArgs = z.object({
  sessionId: z.string().min(1).optional(),
  waitMs: z.number().int().min(0).max(10_000).optional(),
});

function parseWith<T>(schema: z.ZodType<T>, raw: unknown) {
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success
    ? ok(parsed.data)
    : err(
        prismError(
          PrismErrorCode.VALIDATION,
          parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        ),
      );
}

/** `/v1/receipt` (plan §5.7): the receipt, from the daemon's own service. */
export async function daemonRoutes(): Promise<Map<string, DaemonTool>> {
  const { receiptService } = await import("./tools/receipt.js");
  return new Map<string, DaemonTool>([
    [
      "/v1/receipt",
      {
        parseArgs: (raw) => parseWith(ReceiptArgs, raw),
        call: ({ workspace }, args) => {
          const { sessionId, waitMs } = args as z.infer<typeof ReceiptArgs>;
          return receiptService().receipt(workspace, {
            ...(sessionId ? { sessionId } : {}),
            ...(waitMs ? { waitMs } : {}),
          });
        },
      },
    ],
  ]);
}

/** `/v1/session`: record the session baseline without waiting for an index. */
export async function daemonRootRoutes(): Promise<
  Map<string, DaemonRootRoute>
> {
  const { recordSessionBaseline } = await import("./safety/receipt-service.js");
  return new Map<string, DaemonRootRoute>([
    [
      "/v1/session",
      {
        parseArgs: (raw) => parseWith(SessionArgs, raw),
        call: async (root, args) => {
          const { sessionId } = args as z.infer<typeof SessionArgs>;
          return recordSessionBaseline(root, sessionId);
        },
      },
    ],
  ]);
}

/**
 * The hook snapshot ranks high-blast files, which takes seconds at 10k files
 * and blocks the daemon while it runs. After the first index it is rewritten
 * only once edits have been quiet this long, never straight after a save.
 */
const SNAPSHOT_QUIET_MS = 15_000;

/** Run the last `task` given for a key once that key has been quiet for `quietMs`. */
export function debouncePerKey(
  quietMs: number,
): (key: string, task: () => Promise<void>) => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return (key, task) => {
    const previous = timers.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      timers.delete(key);
      void task().catch((error: unknown) =>
        degraded("daemon.debounced", error, key),
      );
    }, quietMs);
    timer.unref?.();
    timers.set(key, timer);
  };
}

function degraded(event: string, error: unknown, workspace: string): void {
  recordEvent({
    event,
    outcome: "degraded",
    reason: error instanceof Error ? error.message : String(error),
    workspace,
  });
}

/** What the daemon does after each index: pre-warm, hook snapshot, lenses. */
export async function daemonOnIndexed(): Promise<
  (workspace: PrismWorkspace) => Promise<void>
> {
  const { refreshHookSnapshot } = await import("./safety/snapshot.js");
  const { seedLenses } = await import("@repo-prism/shared/lens-store");
  const snapshots = debouncePerKey(SNAPSHOT_QUIET_MS);
  const seeded = new Set<string>();
  return async (workspace) => {
    if (seeded.has(workspace.rootPath)) {
      snapshots(workspace.rootPath, () => refreshHookSnapshot(workspace));
      return;
    }
    seeded.add(workspace.rootPath);
    // First index: hooks are waiting on this file ("still indexing").
    await refreshHookSnapshot(workspace);
    await seedLenses(workspace).catch((error: unknown) =>
      degraded("daemon.seed_lenses", error, workspace.rootPath),
    );
    // Once, after the first index: the session's first auto-Prepare should
    // not pay for building every graph. Not after each save — at 10k files
    // that blocked the daemon for seconds per edit (08_PERFORMANCE.md).
    await workspace
      .prepareChange({ task: "prewarm", budget: 200 })
      .catch((error: unknown) =>
        degraded("daemon.prewarm", error, workspace.rootPath),
      );
  };
}

/** Foreground entry for `prism-mcp --daemon`. */
export async function runDaemon(): Promise<void> {
  const { startDaemon } = await import("@repo-prism/daemon/server");
  const started = await startDaemon({
    buildId: daemonBuildId(),
    tools: daemonTools(),
    routes: await daemonRoutes(),
    rootRoutes: await daemonRootRoutes(),
    onIndexed: await daemonOnIndexed(),
  });
  if (started.kind === "already-running") {
    process.stderr.write(
      `prism-daemon: already running (pid ${started.record.pid})\n`,
    );
    return;
  }
  const at = process.argv.indexOf("--warm");
  const warm = at >= 0 ? process.argv[at + 1] : undefined;
  if (warm && isAbsolute(warm)) started.pool.warm(warm);
  const stop = (): void => {
    void started.close().then(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
