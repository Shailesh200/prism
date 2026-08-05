#!/usr/bin/env node
/**
 * `prism-mcp` entrypoint (M-026).
 *
 * Nothing here writes to stdout: it belongs to the protocol. Startup detail
 * goes to stderr, where agent clients surface it as server logs.
 */

import { resolveWorkspaceFromProcess, startStdioServer } from "./server.js";

async function main(): Promise<void> {
  const workspace = resolveWorkspaceFromProcess();
  process.stderr.write(
    `prism-mcp: workspace ${workspace.path} (from ${workspace.source})\n`,
  );

  await startStdioServer({ workspaceRoot: workspace.path });
  process.stderr.write("prism-mcp: ready on stdio\n");
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`prism-mcp: failed to start — ${message}\n`);
  process.exit(1);
});
