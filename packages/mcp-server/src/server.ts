/**
 * The MCP server spine (M-026): stdio transport, handshake, tool registration,
 * graceful shutdown.
 *
 * The one hard rule of a stdio MCP server is that **stdout carries protocol
 * frames and nothing else**. A stray `console.log` anywhere in this process
 * corrupts the stream and the client sees a parse error rather than a message
 * about whatever was being logged. Everything diagnostic goes to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createWorkspaceSession,
  type SessionOptions,
  type WorkspaceSession,
} from "./session.js";
import { registerTools } from "./tool-registry.js";
import { TOOLS } from "./tools.js";
import {
  resolveWorkspacePath,
  workspaceArgFrom,
  type ResolvedWorkspace,
} from "./workspace-resolution.js";

export const SERVER_NAME = "prism";

export type CreateServerOptions = {
  readonly workspaceRoot: string;
  readonly version?: string;
  /** Injectable for tests. */
  readonly openWorkspace?: SessionOptions["openWorkspace"];
};

export type PrismMcpServer = {
  readonly server: McpServer;
  readonly session: WorkspaceSession;
};

/**
 * Build the server without connecting it. Registration is pure bookkeeping —
 * no workspace is opened and nothing is indexed, so `initialize` stays fast
 * however large the repository is.
 */
export function createPrismMcpServer(
  options: CreateServerOptions,
): PrismMcpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: options.version ?? "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Prism answers structural questions about the local repository: what it is, how healthy it is, how it is laid out, and what breaks if you change a given file. All analysis is local. Call prism_blast_radius before editing unfamiliar code.",
    },
  );

  const session = createWorkspaceSession({
    root: options.workspaceRoot,
    ...(options.openWorkspace ? { openWorkspace: options.openWorkspace } : {}),
  });

  registerTools(server, session, TOOLS, options.workspaceRoot);

  return { server, session };
}

/** Resolve the workspace from argv and the environment. */
export function resolveWorkspaceFromProcess(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): ResolvedWorkspace {
  return resolveWorkspacePath({
    argument: workspaceArgFrom(argv),
    environment: env.PRISM_WORKSPACE,
    cwd,
  });
}

/**
 * Start the server on stdio and wire shutdown.
 *
 * Shutdown closes the workspace, which releases the SQLite handle. Skipping it
 * leaves a `-wal` file behind that the next process has to recover, so the
 * signal handlers are load-bearing rather than tidiness.
 */
export async function startStdioServer(
  options: CreateServerOptions,
): Promise<PrismMcpServer> {
  const instance = createPrismMcpServer(options);
  const transport = new StdioServerTransport();

  let closed = false;
  const shutdown = (): void => {
    if (closed) return;
    closed = true;
    instance.session.close();
    void instance.server.close();
  };

  process.once("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
  // The parent agent closing our stdin is the normal way this process ends.
  process.stdin.once("close", shutdown);
  process.once("beforeExit", shutdown);

  await instance.server.connect(transport);
  return instance;
}
