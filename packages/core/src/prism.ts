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
import type { PrismEnginePorts } from "./ports.js";
import { createWorkspace, type PrismWorkspace } from "./workspace.js";
import { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "./version.js";

export type PrismClientOptions = {
  /** Override capability advertisement (tests / progressive enablement). */
  readonly capabilities?: PrismCapabilities;
  /** Optional engine ports — unwired in M-003. */
  readonly ports?: PrismEnginePorts;
};

export type PrismClient = {
  readonly version: typeof PRISM_CORE_VERSION;
  readonly apiLevel: typeof PRISM_API_LEVEL;
  readonly capabilities: PrismCapabilities;
  /**
   * Open a repository workspace at an absolute filesystem path.
   * Analyze is a no-op stub until the indexer is wired.
   */
  openRepository(rootAbsolutePath: string): Result<PrismWorkspace, PrismError>;
};

/**
 * Public entrypoint — MCP, CLI, and IDE extensions must use this façade only.
 *
 * @example
 * ```ts
 * const prism = Prism.create();
 * const opened = prism.openRepository("/path/to/repo");
 * if (opened.ok) {
 *   await opened.value.analyze();
 *   opened.value.close();
 * }
 * ```
 */
export const Prism = {
  create(options: PrismClientOptions = {}): PrismClient {
    const capabilities = options.capabilities ?? STUB_CAPABILITIES;
    const ports = options.ports ?? {};

    return {
      version: PRISM_CORE_VERSION,
      apiLevel: PRISM_API_LEVEL,
      capabilities,
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
