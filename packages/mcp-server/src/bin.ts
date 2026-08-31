#!/usr/bin/env node
/**
 * `prism-mcp` entrypoint (M-026).
 *
 * Nothing here writes to stdout: it belongs to the protocol. Startup detail
 * goes to stderr, where agent clients surface it as server logs.
 */

import { maybeReexecLatest } from "./auto-update.js";
import { readPackageVersion } from "./branding.js";
import { trustSystemCertificateAuthorities } from "./system-ca.js";
import { resolveWorkspaceFromProcess, startStdioServer } from "./server.js";

trustSystemCertificateAuthorities();

async function main(): Promise<void> {
  const currentVersion = readPackageVersion();
  const update = await maybeReexecLatest({
    currentVersion,
    argv: process.argv.slice(2),
    env: process.env,
    ...(process.argv[1] ? { entry: process.argv[1] } : {}),
    write: (line) => process.stderr.write(line),
  });
  if (update.status === "reexec" && update.child) {
    const code = await new Promise<number>((resolve) => {
      update.child?.once("exit", (exitCode, signal) => {
        resolve(exitCode ?? (signal ? 1 : 0));
      });
    });
    process.exit(code);
  }

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
