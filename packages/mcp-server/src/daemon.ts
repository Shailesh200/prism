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
import { setChecksYield, setYieldEventSink } from "@repo-prism/checks";
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
const PromptArgs = z.object({
  prompt: z.string(),
  sessionId: z.string().min(1).optional(),
});
const ReceiptArgs = z.object({
  sessionId: z.string().min(1).optional(),
  waitMs: z.number().int().min(0).max(10_000).optional(),
});

const ReceiptStatusArgs = z.object({
  id: z.string().min(1),
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

/**
 * Round 5 (D): background checks yield the CPU and disk to the agent while
 * it works (a prompt or a session start) and run at check priority after a
 * stop. Best-effort; never fails the route.
 */
let yieldEventsWired = false;

/** Incomplete yield sweeps land in events.jsonl (Arc review). */
export function wireYieldEvents(): void {
  if (yieldEventsWired) return;
  yieldEventsWired = true;
  setYieldEventSink((e) => {
    recordEvent({
      event: "checks.yield_incomplete",
      outcome: "degraded",
      reason: e.reason,
      detail: {
        platform: e.platform,
        pgid: e.pgid,
        passes: e.passes,
        mode: e.mode,
      },
    });
  });
}

export function agentBusy(busy: boolean): void {
  wireYieldEvents();
  void setChecksYield(busy).catch((error: unknown) =>
    recordEvent({
      event: "daemon.checks_yield",
      outcome: "degraded",
      reason: error instanceof Error ? error.message : String(error),
    }),
  );
}

/**
 * `/v1/receipt` (plan §5.7): the receipt, from the daemon's own service.
 * `/v1/prompt` (round 2): what the prompt hook injects, in one call.
 * `/v1/receipt-status` (round 4): one stored receipt, waiting on its checks;
 * the background `stop-wait` hook polls it for the session-end verdict.
 */
export async function daemonRoutes(): Promise<Map<string, DaemonTool>> {
  const { receiptService } = await import("./tools/receipt.js");
  const { promptContext } = await import("./safety/prompt-context.js");
  return new Map<string, DaemonTool>([
    [
      "/v1/prompt",
      {
        parseArgs: (raw) => {
          const parsed = parseWith(PromptArgs, raw);
          // Round 5 (D): the agent is working again. Yield on arrival, not
          // after the index wait that `call` sits behind.
          if (parsed.ok) agentBusy(true);
          return parsed;
        },
        call: ({ workspace, env }, args) => {
          const { prompt, sessionId } = args as z.infer<typeof PromptArgs>;
          return promptContext(
            workspace,
            { prompt, ...(sessionId ? { sessionId } : {}) },
            env,
          );
        },
      },
    ],
    [
      "/v1/receipt",
      {
        parseArgs: (raw) => parseWith(ReceiptArgs, raw),
        call: ({ workspace }, args) => {
          const { sessionId, waitMs } = args as z.infer<typeof ReceiptArgs>;
          // The agent stopped: this receipt's checks run at check priority.
          agentBusy(false);
          // P17: stop hook hits this route; do not reindex on the hot path.
          return receiptService().receipt(workspace, {
            ...(sessionId ? { sessionId } : {}),
            ...(waitMs ? { waitMs } : {}),
            reindex: false,
          });
        },
      },
    ],
    [
      "/v1/receipt-status",
      {
        parseArgs: (raw) => parseWith(ReceiptStatusArgs, raw),
        call: async ({ workspace }, args) => {
          const { id, waitMs } = args as z.infer<typeof ReceiptStatusArgs>;
          return ok(
            await receiptService().settle(workspace.rootPath, id, waitMs ?? 0),
          );
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
          agentBusy(true);
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

/**
 * Prepare's graphs are per index, so the first Prepare after a reindex pays
 * for them (token fix 2). Building them once edits have been quiet this long
 * keeps that off the prompt hook's 1 s budget; a burst of saves or a
 * checkout builds them once.
 */
const PREWARM_QUIET_MS = 2_000;

function prewarm(workspace: PrismWorkspace): Promise<void> {
  return workspace
    .prepareChange({ task: "prewarm", budget: 200 })
    .then((result) => {
      if (!result.ok)
        degraded("daemon.prewarm", result.error, workspace.rootPath);
    });
}

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
  const maps = debouncePerKey(SNAPSHOT_QUIET_MS);
  const warms = debouncePerKey(PREWARM_QUIET_MS);
  const seeded = new Set<string>();
  return async (workspace) => {
    if (seeded.has(workspace.rootPath)) {
      warms(workspace.rootPath, () => prewarm(workspace));
      snapshots(workspace.rootPath, () => refreshHookSnapshot(workspace));
      maps(workspace.rootPath, () => {
        const map = workspace.repoMap({});
        if (!map.ok) degraded("daemon.repo_map", map.error, workspace.rootPath);
        return Promise.resolve();
      });
      return;
    }
    seeded.add(workspace.rootPath);
    // First index: hooks are waiting on this file ("still indexing").
    await refreshHookSnapshot(workspace);
    await seedLenses(workspace).catch((error: unknown) =>
      degraded("daemon.seed_lenses", error, workspace.rootPath),
    );
    // After the first index: the session's first auto-Prepare should not pay
    // for building every graph. Later reindexes prewarm once edits are quiet
    // (PREWARM_QUIET_MS), never straight after each save (08_PERFORMANCE.md).
    await prewarm(workspace).catch((error: unknown) =>
      degraded("daemon.prewarm", error, workspace.rootPath),
    );
    {
      const map = workspace.repoMap({});
      if (!map.ok) degraded("daemon.repo_map", map.error, workspace.rootPath);
    }
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
