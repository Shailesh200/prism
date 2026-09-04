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
  ErrorCode,
  RootsListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createIndexProgressReporter } from "./index-progress.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";
import { prismMcpImplementation } from "./branding.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import {
  createWorkspaceSession,
  type SessionOptions,
  type WorkspaceSession,
} from "./session.js";
import { isWorkerRole } from "@repo-prism/dispatch";
import { registerDispatchTools } from "./dispatch-registry.js";
import { registerTools } from "./tool-registry.js";
import { registerWorkerIntelligence } from "./worker-intelligence.js";
import { TOOLS } from "./tools.js";
import {
  createWorkspaceBinding,
  type WorkspaceBinding,
} from "./workspace-binding.js";
import {
  resolveWorkspacePath,
  workspaceArgFrom,
  type ResolvedWorkspace,
  type WorkspaceSource,
} from "./workspace-resolution.js";

export { SERVER_NAME } from "./branding.js";

export type CreateServerOptions = {
  readonly workspaceRoot: string;
  readonly version?: string;
  /** Injectable for tests. */
  readonly openWorkspace?: SessionOptions["openWorkspace"];
  readonly env?: NodeJS.ProcessEnv;
  /** How the startup path was chosen. Used to decide whether MCP roots may override. */
  readonly workspaceSource?: WorkspaceSource;
  /**
   * When true, `--workspace` / `PRISM_WORKSPACE` stay in force even if the
   * client later reports a different root.
   */
  readonly workspaceLocked?: boolean;
};

export type PrismMcpServer = {
  readonly server: McpServer;
  readonly session: WorkspaceSession;
  readonly binding: WorkspaceBinding;
  applyClientRoots(): Promise<void>;
};

/**
 * Build the server without connecting it. Registration is pure bookkeeping —
 * no workspace is opened and nothing is indexed, so `initialize` stays fast
 * however large the repository is.
 */
export function createPrismMcpServer(
  options: CreateServerOptions,
): PrismMcpServer {
  const server = new McpServer(prismMcpImplementation(options.version), {
    capabilities: { tools: {}, prompts: {}, resources: {}, logging: {} },
    instructions: SERVER_INSTRUCTIONS,
  });

  const reportProgress = createIndexProgressReporter((line) => {
    // Prefer MCP logging so agent UIs surface it; also write stderr for
    // clients that only show process logs. Never stdout — that is the protocol.
    void server.sendLoggingMessage({
      level: "info",
      logger: "prism.index",
      data: line,
    });
    process.stderr.write(`prism-mcp: ${line}\n`);
  });

  const binding = createWorkspaceBinding(
    {
      path: options.workspaceRoot,
      source: options.workspaceSource ?? "cwd",
    },
    options.workspaceLocked,
  );

  const innerSession = createWorkspaceSession({
    root: () => binding.current(),
    onIndexProgress: reportProgress,
    ...(options.openWorkspace ? { openWorkspace: options.openWorkspace } : {}),
  });

  /**
   * One roots round-trip: apply whatever the client currently reports. An
   * answer — even an empty one — settles polling until `roots/list_changed`;
   * a capability failure settles it for good; anything else (timeout, client
   * still starting) leaves it retryable so the next call tries again.
   */
  let rootsSettled = false;
  const queryClientRoots = async (): Promise<void> => {
    if (binding.locked) return;
    try {
      const listed = await server.server.listRoots();
      rootsSettled = true;
      const hints = listed.roots.map((root) => root.uri);
      if (binding.applyHints(hints)) {
        process.stderr.write(
          `prism-mcp: workspace ${binding.current()} (from mcp roots)\n`,
        );
      }
    } catch (error) {
      if (isRootsUnsupported(error)) rootsSettled = true;
    }
  };

  /**
   * Polling path for the unresolved case. The first `listRoots` can race the
   * client's own setup, and a one-shot attempt used to leave the server bound
   * to a sandbox cwd forever — which is why `CURSOR_WORKSPACE` existed.
   */
  const applyClientRoots = async (): Promise<void> => {
    if (rootsSettled) return;
    await queryClientRoots();
  };

  /** Ask for roots only while the launch cwd resolved to nothing git-backed. */
  const applyClientRootsIfWeak = async (): Promise<void> => {
    if (binding.source() === "cwd") await applyClientRoots();
  };

  // A folder opened (or changed) after startup re-resolves without a restart.
  server.server.setNotificationHandler(
    RootsListChangedNotificationSchema,
    () => void queryClientRoots(),
  );

  const session: WorkspaceSession = {
    async ready() {
      if (!innerSession.isOpen()) {
        await applyClientRootsIfWeak();
      }
      return innerSession.ready();
    },
    isOpen: () => innerSession.isOpen(),
    close: () => innerSession.close(),
  };

  registerDispatchTools(server, binding.current(), {
    env: options.env ?? process.env,
    getWorkspaceRoot: () => binding.current(),
    applyWorkspaceHint: (path) => binding.applyHints([path]),
    beforeCall: applyClientRootsIfWeak,
  });
  if (isWorkerRole(options.env ?? process.env)) {
    // A worker gets intelligence from the Console, which already has Core
    // loaded and indexed, rather than from a Core of its own (ADR-0050). If no
    // Console answers it gets none — a local fallback here would be the second
    // index ADR-0041 was written to prevent.
    void registerWorkerIntelligence(server, {
      workspaceRoot: binding.current(),
      env: options.env ?? process.env,
    }).catch(() => {
      /* a teammate without intelligence still edits; it must not fail to start */
    });
  } else {
    registerTools(server, session, TOOLS, () => binding.current());
    registerPrompts(server);
    registerResources(server, session);
  }

  return { server, session, binding, applyClientRoots };
}

/**
 * A client without roots never gains the capability mid-session. With the
 * SDK's strict-capability mode the guard throws before the wire; without it
 * the request reaches the client, which answers MethodNotFound when it has no
 * roots handler. Both are permanent — anything else is a transient failure
 * worth retrying.
 */
function isRootsUnsupported(error: unknown): boolean {
  if (
    error instanceof Error &&
    error.message.includes("does not support listing roots")
  ) {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === ErrorCode.MethodNotFound
  );
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
    env,
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
  await instance.applyClientRoots();
  return instance;
}
