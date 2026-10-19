/**
 * `prism graph` (M-095, ADR-0063): the daemon that keeps each repository's
 * graph fresh. `status` (default), `serve`, `stop`, `refresh`, `map`, and `export`
 * (graph.json). The HTML page, the markdown report, `open` and the git-hook writer
 * were deleted in 2.0 (§0.4 #35, #37).
 */

import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  daemonBuildIdFor,
  type DaemonStatus,
  daemonStatus,
  ensureDaemon,
  reindexDaemonWorkspace,
  stopDaemon,
  warmDaemonWorkspace,
} from "@repo-prism/daemon";
import { PrismErrorCode, err, ok, prismError } from "@repo-prism/shared";
import { isNodeScript, resolvePrismBin } from "@repo-prism/shared/prism-bin";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import { paint, renderHeading } from "../output.js";
import type { CommandHandler } from "../runtime.js";

/**
 * `prism-mcp --daemon` from the resolved server bin (§2.1): PRISM_MCP_BIN,
 * install.json, PATH, then the build next to this CLI. Never npx.
 */
export function daemonLaunch(
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[]; buildId?: string } | string {
  const here = dirname(fileURLToPath(import.meta.url));
  const resolved = resolvePrismBin({
    env,
    packCandidates: [
      resolve(here, "../../../mcp-server/dist/bin.js"),
      resolve(here, "../../mcp-server/dist/bin.js"),
      // `npm i -g @prismapp/cli`: the server is bundled next to the CLI.
      resolve(here, "../../node_modules/@repo-prism/mcp-server/dist/bin.js"),
    ],
  });
  if (!resolved.ok)
    return `no Prism server found (${resolved.tried.join("; ")}). Run \`prism install <editor> --local <checkout>\``;
  // `prism-mcp` on PATH is usually a symlink to the server's bin.js (npm's
  // global bin, node_modules/.bin). Taken as a native binary it launched with
  // no build id, so a daemon from another build was never replaced (round 4
  // fresh-copy QA: start.test failed once the CLI depended on the server).
  const bin = realBin(resolved.bin);
  if (!isNodeScript(bin)) return { command: bin, args: ["--daemon"] };
  // The build id lets ensureDaemon replace a daemon from another build.
  const buildId = daemonBuildIdFor(join(dirname(bin), "daemon-attach.js"));
  return {
    command: process.execPath,
    args: [bin, "--daemon"],
    ...(buildId ? { buildId } : {}),
  };
}

/** The file a launcher path points at; the path itself when it cannot be read. */
export function realBin(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function renderStatus(status: DaemonStatus | null, reason: string | null) {
  return ({ color }: { color: boolean }) => {
    const lines = [renderHeading("Prism graph daemon", color), ""];
    if (!status) {
      lines.push(`Not running: ${reason}.`, "", "Start it: prism graph serve");
      return lines.join("\n");
    }
    lines.push(
      `${paint("running", "green", color)}  pid ${status.pid} · port ${status.port} · ${status.rssMb} MB`,
      `build    ${status.buildId}`,
      `since    ${status.startedAt}`,
    );
    if (status.paused) lines.push(`paused   ${status.pauseReason}`);
    lines.push("");
    if (status.workspaces.length === 0) {
      lines.push("No workspace open yet.");
    }
    for (const row of status.workspaces) {
      const tone =
        row.state === "fresh"
          ? "green"
          : row.state === "failed"
            ? "red"
            : "yellow";
      lines.push(`${paint(row.state.padEnd(8), tone, color)} ${row.root}`);
      const detail = [
        row.lastIndexedAt ? `indexed ${row.lastIndexedAt}` : "not indexed yet",
        row.pendingDirtyCount > 0 ? `${row.pendingDirtyCount} pending` : null,
        row.lastReindexMs !== null ? `last edit ${row.lastReindexMs}ms` : null,
      ].filter(Boolean);
      lines.push(`         ${detail.join(" · ")}`);
      if (row.error) lines.push(`         ${row.error}`);
    }
    return lines.join("\n");
  };
}

export function writeGraphJson(out: string, graph: unknown): { json: string } {
  mkdirSync(out, { recursive: true });
  const json = join(out, "graph.json");
  writeFileSync(json, `${JSON.stringify(graph)}\n`);
  return { json };
}

export const graphCommand: CommandHandler = async (context) => {
  const action = context.args.positionals[0] ?? "status";
  const root = context.workspace.path;
  const env = process.env;

  if (action === "status") {
    const status = await daemonStatus({ env });
    return ok({
      data:
        status.kind === "ok"
          ? { running: true, ...status.value }
          : {
              running: false,
              reason:
                status.kind === "unavailable"
                  ? status.reason
                  : status.error.message,
            },
      human: renderStatus(
        status.kind === "ok" ? status.value : null,
        status.kind === "unavailable"
          ? status.reason
          : status.kind === "error"
            ? status.error.message
            : null,
      ),
    });
  }

  if (action === "serve") {
    if (env.PRISM_DAEMON === "0") {
      return err(
        prismError(
          PrismErrorCode.UNSUPPORTED,
          "The daemon is off (PRISM_DAEMON=0).",
        ),
      );
    }
    const launch = daemonLaunch(env);
    if (typeof launch === "string")
      return err(prismError(PrismErrorCode.NOT_FOUND, launch));
    context.progress("Starting the graph daemon…");
    const started = await ensureDaemon({
      ...launch,
      env: { ...env, PRISM_DAEMON: "1" },
      waitMs: 10_000,
    });
    if (started.kind !== "ok") {
      return err(
        prismError(
          PrismErrorCode.UNSUPPORTED,
          `The daemon did not start: ${started.kind === "unavailable" ? started.reason : started.error.message}`,
        ),
      );
    }
    await warmDaemonWorkspace({
      root,
      env: { ...env, PRISM_DAEMON: "1" },
      ...(launch.buildId ? { buildId: launch.buildId } : {}),
    });
    const status = await daemonStatus({ env: { ...env, PRISM_DAEMON: "1" } });
    return ok({
      data: {
        started: started.value.started,
        ...(status.kind === "ok" ? status.value : {}),
      },
      human: renderStatus(status.kind === "ok" ? status.value : null, null),
    });
  }

  if (action === "stop") {
    const stopped = await stopDaemon({ env });
    return ok({
      data: { stopped: stopped.kind === "ok" },
      human: () =>
        stopped.kind === "ok"
          ? "Prism graph daemon stopped."
          : "Prism graph daemon was not running.",
    });
  }

  if (action === "refresh") {
    const refreshed = await reindexDaemonWorkspace({ root, env });
    if (refreshed.kind === "error") return err(refreshed.error);
    return ok({
      data:
        refreshed.kind === "ok"
          ? { refreshed: true, indexedAt: refreshed.value.indexedAt }
          : { refreshed: false, reason: refreshed.reason },
      human: () =>
        refreshed.kind === "ok"
          ? `Reindexed ${root} at ${refreshed.value.indexedAt}.`
          : `Not refreshed: ${refreshed.reason}.`,
    });
  }

  if (action === "map") {
    const opened = await context.open();
    if (!opened.ok) return opened;
    const scope = context.args.option("scope") ?? undefined;
    const budgetRaw = context.args.option("budget");
    const maxTokens = budgetRaw ? Number(budgetRaw) : undefined;
    const map = opened.value.repoMap({
      ...(scope ? { scope } : {}),
      ...(maxTokens !== undefined && Number.isFinite(maxTokens)
        ? { maxTokens }
        : {}),
      refresh: context.args.flag("refresh"),
    });
    if (!map.ok) return map;
    return ok({
      data: {
        snapshotKey: map.value.snapshotKey,
        tokens: map.value.tokenEstimate,
        kept: map.value.kept,
        total: map.value.total,
        truncated: map.value.truncated,
        fromCache: map.value.fromCache,
      },
      human: () => map.value.text,
    });
  }

  if (action === "export") {
    const opened = await context.open();
    if (!opened.ok) return opened;
    const exported = await opened.value.exportGraph();
    if (!exported.ok) return exported;
    const outOption = context.args.option("out");
    const out = outOption
      ? resolve(context.cwd, outOption)
      : join(workspacePrismDir(root), "graph");
    const files = writeGraphJson(out, exported.value.graph);
    const { stats } = exported.value.graph;
    return ok({
      data: { out, files: [files.json], stats },
      human: () =>
        [
          `Wrote ${files.json}`,
          `${stats.packages} packages · ${stats.files} files · ${stats.tests} tests · ${stats.symbols} exported symbols · ${stats.edges} edges`,
        ].join("\n"),
    });
  }

  return err(
    prismError(
      PrismErrorCode.VALIDATION,
      `Unknown action "${action}". Try: prism graph status | serve | stop | refresh | map | export`,
    ),
  );
};
