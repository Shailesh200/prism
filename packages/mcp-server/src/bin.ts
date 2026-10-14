#!/usr/bin/env node
/**
 * `prism-mcp` entrypoint (M-026).
 *
 * Nothing here writes to stdout: it belongs to the protocol. Startup detail
 * goes to stderr, where agent clients surface it as server logs.
 */

import { readPackageVersion } from "./branding.js";
import { trustSystemCertificateAuthorities } from "./system-ca.js";
import { resolveWorkspaceFromProcess, startStdioServer } from "./server.js";
import { checkForUpdate, updateNotice } from "./update-check.js";

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

  // Background only (plan §2.3): never delays startup, never relaunches.
  void checkForUpdate({
    currentVersion,
    env: process.env,
    ...(process.argv[1] ? { entry: process.argv[1] } : {}),
  }).then((outcome) => {
    const notice = updateNotice(outcome);
    if (notice) process.stderr.write(notice);
  });
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`prism-mcp: failed to start — ${message}\n`);
  process.exit(1);
});
