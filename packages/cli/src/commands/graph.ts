/**
 * `prism graph` (M-095, ADR-0063): the daemon that keeps each repository's
 * graph fresh. `status` (default), `serve`, `stop`, `refresh`, and
 * `hooks install|uninstall` for the optional git hooks.
 */

import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type DaemonStatus,
  daemonStatus,
  ensureDaemon,
  reindexDaemonWorkspace,
  stopDaemon,
  warmDaemonWorkspace,
} from "@repo-prism/daemon";
import {
  PrismErrorCode,
  err,
  ok,
  prismError,
  renderGraphHtml,
  renderGraphReport,
} from "@repo-prism/shared";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import { paint, renderHeading } from "../output.js";
import type { CommandHandler } from "../runtime.js";

/** The git hooks that can rewrite many files at once. */
export const GRAPH_GIT_HOOKS = ["post-checkout", "post-merge", "post-commit"];

const BEGIN = "# >>> prism graph >>>";
const END = "# <<< prism graph <<<";

/** `prism-mcp --daemon` from the nearest build, else the published server. */
export function daemonLaunch(env: NodeJS.ProcessEnv = process.env): {
  command: string;
  args: string[];
} {
  const explicit = env.PRISM_MCP_BIN?.trim();
  if (explicit)
    return { command: process.execPath, args: [explicit, "--daemon"] };
  const here = dirname(fileURLToPath(import.meta.url));
  for (const rel of [
    "../../../mcp-server/dist/bin.js",
    "../../mcp-server/dist/bin.js",
  ]) {
    const bin = resolve(here, rel);
    if (existsSync(bin)) {
      return { command: process.execPath, args: [bin, "--daemon"] };
    }
  }
  return { command: "npx", args: ["-y", "@repo-prism/mcp-server", "--daemon"] };
}

/** Replace or append Prism's block, leaving the rest of a hook untouched. */
export function withGraphBlock(existing: string | null, line: string): string {
  const block = `${BEGIN}\n${line}\n${END}\n`;
  if (existing === null) return `#!/bin/sh\n${block}`;
  const stripped = withoutGraphBlock(existing);
  return `${stripped.endsWith("\n") || stripped === "" ? stripped : `${stripped}\n`}${block}`;
}

export function withoutGraphBlock(existing: string): string {
  const start = existing.indexOf(BEGIN);
  if (start < 0) return existing;
  const end = existing.indexOf(END, start);
  if (end < 0) return existing;
  return existing.slice(0, start) + existing.slice(end + END.length + 1);
}

function gitHooksDir(root: string): string | null {
  const out = spawnSync("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: root,
    encoding: "utf8",
  });
  if (out.status !== 0) return null;
  const path = out.stdout.trim();
  return isAbsolute(path) ? path : join(root, path);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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

export function writeGraphFiles(
  out: string,
  exported: {
    graph: Parameters<typeof renderGraphHtml>[0];
    report: Parameters<typeof renderGraphReport>[0];
  },
): { json: string; report: string; html: string } {
  mkdirSync(out, { recursive: true });
  const json = join(out, "graph.json");
  const report = join(out, "GRAPH_REPORT.md");
  const html = join(out, "graph.html");
  writeFileSync(json, `${JSON.stringify(exported.graph)}\n`);
  writeFileSync(report, renderGraphReport(exported.report));
  writeFileSync(html, renderGraphHtml(exported.graph));
  return { json, report, html };
}

function openInBrowser(file: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  const child = spawn(command, [file], { detached: true, stdio: "ignore" });
  child.unref();
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

  if (action === "export" || action === "open") {
    const opened = await context.open();
    if (!opened.ok) return opened;
    const exported = await opened.value.exportGraph();
    if (!exported.ok) return exported;
    const outOption = context.args.option("out");
    const out = outOption
      ? resolve(context.cwd, outOption)
      : join(workspacePrismDir(root), "graph");
    const files = writeGraphFiles(out, exported.value);
    if (action === "open") openInBrowser(files.html);
    const { stats } = exported.value.graph;
    return ok({
      data: { out, files: [files.json, files.report, files.html], stats },
      human: () =>
        [
          `Wrote ${files.json}`,
          `Wrote ${files.report}`,
          `Wrote ${files.html}`,
          `${stats.packages} packages · ${stats.files} files · ${stats.tests} tests · ${stats.symbols} exported symbols · ${stats.edges} edges`,
        ].join("\n"),
    });
  }

  if (action === "hooks") {
    const mode = context.args.positionals[1] ?? "install";
    if (mode !== "install" && mode !== "uninstall") {
      return err(
        prismError(
          PrismErrorCode.VALIDATION,
          `Unknown hooks action "${mode}". Try: prism graph hooks install`,
        ),
      );
    }
    const dir = gitHooksDir(root);
    if (!dir) {
      return err(
        prismError(
          PrismErrorCode.UNSUPPORTED,
          `${root} is not a git repository.`,
        ),
      );
    }
    const cli = process.argv[1] ? resolve(process.argv[1]) : null;
    if (!cli) {
      return err(
        prismError(PrismErrorCode.UNSUPPORTED, "Cannot locate the prism CLI."),
      );
    }
    const line = `${shellQuote(process.execPath)} ${shellQuote(cli)} graph refresh --workspace ${shellQuote(root)} --quiet >/dev/null 2>&1 &`;
    const changed: string[] = [];
    mkdirSync(dir, { recursive: true });
    for (const name of GRAPH_GIT_HOOKS) {
      const path = join(dir, name);
      const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
      if (mode === "install") {
        writeFileSync(path, withGraphBlock(existing, line));
        chmodSync(path, 0o755);
        changed.push(path);
      } else if (existing !== null && existing.includes(BEGIN)) {
        writeFileSync(path, withoutGraphBlock(existing));
        changed.push(path);
      }
    }
    return ok({
      data: { action: mode, hooks: changed },
      human: () =>
        changed.length === 0
          ? "No Prism git hooks to remove."
          : [
              mode === "install"
                ? "Installed Prism's block in:"
                : "Removed Prism's block from:",
              ...changed.map((path) => `  ${path}`),
            ].join("\n"),
    });
  }

  return err(
    prismError(
      PrismErrorCode.VALIDATION,
      `Unknown action "${action}". Try: prism graph status | serve | stop | refresh | export | open | hooks install`,
    ),
  );
};
