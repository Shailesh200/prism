/**
 * `prism graph` (M-095, ADR-0063): the daemon that keeps each repository's
 * graph fresh. `status` (default), `serve`, `stop`, `refresh`, and `export`
 * (graph.json). The HTML page, the markdown report, `open` and the git-hook writer
 * were deleted in 2.0 (§0.4 #35, #37).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
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
): { command: string; args: string[] } | string {
  const here = dirname(fileURLToPath(import.meta.url));
  const resolved = resolvePrismBin({
    env,
    packCandidates: [
      resolve(here, "../../../mcp-server/dist/bin.js"),
      resolve(here, "../../mcp-server/dist/bin.js"),
    ],
  });
  if (!resolved.ok)
    return `no Prism server found (${resolved.tried.join("; ")}). Run \`prism install <editor> --local <checkout>\``;
  return isNodeScript(resolved.bin)
    ? { command: process.execPath, args: [resolved.bin, "--daemon"] }
    : { command: resolved.bin, args: ["--daemon"] };
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
    await warmDaemonWorkspace({ root, env: { ...env, PRISM_DAEMON: "1" } });
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
      `Unknown action "${action}". Try: prism graph status | serve | stop | refresh | export`,
    ),
  );
};
