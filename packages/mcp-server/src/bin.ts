#!/usr/bin/env node
/**
 * `prism-mcp` entrypoint (M-026).
 *
 * Nothing here writes to stdout: it belongs to the protocol. Startup detail
 * goes to stderr, where agent clients surface it as server logs.
 */

import { readPackageVersion } from "./branding.js";
import { maybeSelfUpdate } from "./self-update.js";
import { trustSystemCertificateAuthorities } from "./system-ca.js";
import { resolveWorkspaceFromProcess, startStdioServer } from "./server.js";

trustSystemCertificateAuthorities();

async function main(): Promise<void> {
  if (process.argv.includes("--hook")) {
    const { runMcpHook } = await import("./safety/hook-command.js");
    await runMcpHook(process.argv);
    return;
  }
  if (process.argv.includes("--daemon")) {
    const { runDaemon } = await import("./daemon.js");
    await runDaemon();
    return;
  }
  const currentVersion = readPackageVersion();
  const update = await maybeSelfUpdate({
    currentVersion,
    env: process.env,
    ...(process.argv[1] ? { entry: process.argv[1] } : {}),
    execPath: process.execPath,
    argv: process.argv.slice(1),
  });
  if (update.kind === "relaunch") process.exit(update.status);

  const workspace = resolveWorkspaceFromProcess();
  process.stderr.write(
    `prism-mcp ${currentVersion}: workspace ${workspace.path} (from ${workspace.source})\n`,
  );

  await startStdioServer({
    workspaceRoot: workspace.path,
    workspaceSource: workspace.source,
    workspaceLocked:
      workspace.source === "argument" || workspace.source === "environment",
  });
  process.stderr.write("prism-mcp: ready on stdio\n");
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`prism-mcp: failed to start — ${message}\n`);
  process.exit(1);
});
