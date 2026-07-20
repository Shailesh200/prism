import { isAbsolute } from "node:path";
import {
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@prism/shared";
import { STUB_CAPABILITIES, type PrismCapabilities } from "./capabilities.js";
import { createDefaultAnalyzerPort } from "./default-ports.js";
import type { LanguagePluginInfo, PrismEnginePorts } from "./ports.js";
import { createWorkspace, type PrismWorkspace } from "./workspace.js";
import { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "./version.js";

export type PrismClientOptions = {
  /** Override capability advertisement (tests / progressive enablement). */
  readonly capabilities?: PrismCapabilities;
  /**
   * Optional engine ports. If `analyzer` is omitted, Core wires a default
   * analyzer host with the noop plugin (M-004+).
   */
  readonly ports?: PrismEnginePorts;
  /** Skip default analyzer wiring (plugin list stays empty). */
  readonly disableDefaultAnalyzer?: boolean;
};

export type PrismClient = {
  readonly version: typeof PRISM_CORE_VERSION;
  readonly apiLevel: typeof PRISM_API_LEVEL;
  readonly capabilities: PrismCapabilities;
  /** Language plugins loaded in the wired analyzer host. */
  listLanguagePlugins(): readonly LanguagePluginInfo[];
  /**
   * Open a repository workspace at an absolute filesystem path.
   * Analyze is a no-op stub until the indexer is wired.
   */
  openRepository(rootAbsolutePath: string): Result<PrismWorkspace, PrismError>;
};

function resolvePorts(options: PrismClientOptions): PrismEnginePorts {
  if (options.disableDefaultAnalyzer) {
    return options.ports ?? {};
  }
  const ports = options.ports ?? {};
  if (ports.analyzer !== undefined) {
    return ports;
  }
  return { ...ports, analyzer: createDefaultAnalyzerPort() };
}

function resolveCapabilities(
  options: PrismClientOptions,
  ports: PrismEnginePorts,
): PrismCapabilities {
  if (options.capabilities) return options.capabilities;
  return {
    ...STUB_CAPABILITIES,
    analysis: ports.analyzer !== undefined,
  };
}

/**
 * Public entrypoint — MCP, CLI, and IDE extensions must use this façade only.
 *
 * @example
 * ```ts
 * const prism = Prism.create();
 * console.log(prism.listLanguagePlugins());
 * const opened = prism.openRepository("/path/to/repo");
 * if (opened.ok) {
 *   await opened.value.analyze();
 *   opened.value.close();
 * }
 * ```
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
          }),
        );
      },
    };
  },
};
