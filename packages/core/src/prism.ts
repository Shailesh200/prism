import { isAbsolute } from "node:path";
import {
  PrismErrorCode,
  type PrismError,
  type Result,
  type StackProfile,
  err,
  ok,
  prismError,
} from "@prism/shared";
import { STUB_CAPABILITIES, type PrismCapabilities } from "./capabilities.js";
import {
  createDefaultAnalyzerPort,
  createDefaultIndexerPort,
  createDefaultStackPort,
} from "./default-ports.js";
import type {
  LanguagePluginInfo,
  PrismEnginePorts,
  StackDetectorInfo,
} from "./ports.js";
import { createWorkspace, type PrismWorkspace } from "./workspace.js";
import { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "./version.js";

export type PrismClientOptions = {
  /** Override capability advertisement (tests / progressive enablement). */
  readonly capabilities?: PrismCapabilities;
  /**
   * Optional engine ports. If analyzer / indexer / stack are omitted, Core
   * wires defaults (unless the matching disable* flag is set).
   */
  readonly ports?: PrismEnginePorts;
  /** Skip default analyzer wiring (plugin list stays empty). */
  readonly disableDefaultAnalyzer?: boolean;
  /** Skip default indexer wiring. */
  readonly disableDefaultIndexer?: boolean;
  /** Skip default stack detector wiring. */
  readonly disableDefaultStack?: boolean;
};

export type PrismClient = {
  readonly version: typeof PRISM_CORE_VERSION;
  readonly apiLevel: typeof PRISM_API_LEVEL;
  readonly capabilities: PrismCapabilities;
  /** Language plugins loaded in the wired analyzer host. */
  listLanguagePlugins(): readonly LanguagePluginInfo[];
  /** Stack detectors loaded in the wired stack host (M-040). */
  listStackDetectors(): readonly StackDetectorInfo[];
  /**
   * Stub stack profile for an absolute workspace root (rich packs in M-013).
   * Does not require `openRepository`.
   */
  getStackProfile(
    rootAbsolutePath: string,
  ): Promise<Result<StackProfile, PrismError>>;
  /**
   * Open a repository workspace at an absolute filesystem path.
   */
  openRepository(rootAbsolutePath: string): Result<PrismWorkspace, PrismError>;
};

function resolvePorts(options: PrismClientOptions): PrismEnginePorts {
  let ports: PrismEnginePorts = options.ports ? { ...options.ports } : {};

  if (!options.disableDefaultAnalyzer && ports.analyzer === undefined) {
    ports = { ...ports, analyzer: createDefaultAnalyzerPort() };
  }
  if (!options.disableDefaultIndexer && ports.indexer === undefined) {
    ports = { ...ports, indexer: createDefaultIndexerPort() };
  }
  if (!options.disableDefaultStack && ports.stack === undefined) {
    ports = { ...ports, stack: createDefaultStackPort() };
  }
  return ports;
}

function resolveCapabilities(
  options: PrismClientOptions,
  ports: PrismEnginePorts,
): PrismCapabilities {
  if (options.capabilities) return options.capabilities;
  return {
    ...STUB_CAPABILITIES,
    analysis: ports.analyzer !== undefined,
    indexing: ports.indexer !== undefined,
    // M-010: dependency graph built in-process from the index snapshot
    graphs: ports.indexer !== undefined,
    // M-013: Repository DNA via stack detector packs
    intelligence: ports.stack !== undefined,
    // M-020: blast radius derives from the index snapshot dependency graph
    impact: ports.indexer !== undefined,
    // M-017: repository map (+ git signals) from the index snapshot
    map: ports.indexer !== undefined,
    // M-016: findRoute / landmarks from graphs
    navigation: ports.indexer !== undefined,
  };
}

/**
 * Public entrypoint — MCP, CLI, and IDE extensions must use this façade only.
 */
export const Prism = {
  create(options: PrismClientOptions = {}): PrismClient {
    const ports = resolvePorts(options);
    const capabilities = resolveCapabilities(options, ports);

    return {
      version: PRISM_CORE_VERSION,
      apiLevel: PRISM_API_LEVEL,
      capabilities,
      listLanguagePlugins() {
        return ports.analyzer?.listPlugins() ?? [];
      },
      listStackDetectors() {
        return ports.stack?.listDetectors() ?? [];
      },
      async getStackProfile(rootAbsolutePath: string) {
        if (!ports.stack) {
          return err(
            prismError(
              PrismErrorCode.UNSUPPORTED,
              "Stack detection is not wired",
            ),
          );
        }
        const trimmed = rootAbsolutePath.trim();
        if (!trimmed) {
          return err(
            prismError(PrismErrorCode.INVALID_PATH, "Repository path is empty"),
          );
        }
        if (!isAbsolute(trimmed)) {
          return err(
            prismError(
              PrismErrorCode.INVALID_PATH,
              "getStackProfile requires an absolute filesystem path",
            ),
          );
        }
        return ports.stack.detectWorkspaceProfile(trimmed);
      },
      openRepository(rootAbsolutePath: string) {
        const trimmed = rootAbsolutePath.trim();
        if (!trimmed) {
          return err(
            prismError(PrismErrorCode.INVALID_PATH, "Repository path is empty"),
          );
        }
        if (!isAbsolute(trimmed)) {
          return err(
            prismError(
              PrismErrorCode.INVALID_PATH,
              "openRepository requires an absolute filesystem path",
            ),
          );
        }
        return ok(
          createWorkspace({
            rootPath: trimmed,
            capabilities,
            ports,
            coreVersion: PRISM_CORE_VERSION,
            apiLevel: PRISM_API_LEVEL,
          }),
        );
      },
    };
  },
};
