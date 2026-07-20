import { readFile } from "node:fs/promises";
import {
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@prism/shared";
import { PluginRegistry } from "./registry.js";
import type { LanguagePlugin, LanguagePluginInfo } from "./types.js";

export type AnalyzerHostOptions = {
  readonly plugins?: readonly LanguagePlugin[];
};

/**
 * Analyzer host — owns the registry and file analyze pipeline.
 * Wired into Core as `AnalyzerPort` (surfaces never import this package).
 */
export type AnalyzerHost = {
  readonly id: "prism-analyzer";
  readonly registry: PluginRegistry;
  listPlugins(): readonly LanguagePluginInfo[];
  analyzeFile(absolutePath: string): Promise<
    Result<
      {
        pluginId: string;
        path: string;
        symbols: readonly unknown[];
        imports: readonly unknown[];
      },
      PrismError
    >
  >;
};

export function createAnalyzerHost(
  options: AnalyzerHostOptions = {},
): AnalyzerHost {
  const registry = new PluginRegistry();
  for (const plugin of options.plugins ?? []) {
    const registered = registry.register(plugin);
    if (!registered.ok) {
      throw new Error(
        `Failed to register plugin "${plugin.id}": ${registered.error.message}`,
      );
    }
  }

  return {
    id: "prism-analyzer",
    registry,
    listPlugins() {
      return registry.list();
    },
    async analyzeFile(absolutePath: string) {
      const plugin = registry.resolveForPath(absolutePath);
      if (!plugin) {
        return err(
          prismError(
            PrismErrorCode.UNSUPPORTED,
            `No language plugin for path: ${absolutePath}`,
            { path: absolutePath },
          ),
        );
      }
      if (!plugin.detect({ path: absolutePath })) {
        return err(
          prismError(
            PrismErrorCode.ANALYZER_FAILED,
            `Plugin "${plugin.id}" declined path: ${absolutePath}`,
            { path: absolutePath, pluginId: plugin.id },
          ),
        );
      }

      let content: string;
      try {
        content = await readFile(absolutePath, "utf8");
      } catch (cause) {
        return err(
          prismError(
            PrismErrorCode.IO_ERROR,
            `Failed to read file: ${absolutePath}`,
            { path: absolutePath, cause: String(cause) },
          ),
        );
      }

      const parsed = await plugin.parse({ path: absolutePath, content });
      if (!parsed.ok) return parsed;

      const symbols = plugin.extractSymbols(parsed.value);
      if (!symbols.ok) return symbols;
      const imports = plugin.extractImports(parsed.value);
      if (!imports.ok) return imports;

      return ok({
        pluginId: plugin.id,
        path: absolutePath,
        symbols: symbols.value.symbols,
        imports: imports.value.imports,
      });
    },
  };
}
