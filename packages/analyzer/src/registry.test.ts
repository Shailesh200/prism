import { describe, expect, it } from "vitest";
import { PrismErrorCode } from "@repo-prism/shared";
import { PluginRegistry } from "./registry.js";
import { createNoopPlugin } from "./noop-plugin.js";
import { ANALYZER_SPI_VERSION } from "./spi-version.js";
import type { LanguagePlugin } from "./types.js";
import { ok } from "@repo-prism/shared";

function stubPlugin(
  overrides: Partial<LanguagePlugin> &
    Pick<LanguagePlugin, "id" | "extensions">,
): LanguagePlugin {
  return {
    spiVersion: ANALYZER_SPI_VERSION,
    capabilities: {
      detect: true,
      parse: true,
      extractSymbols: true,
      extractImports: true,
      extractExports: true,
      extractReferences: true,
    },
    detect: () => true,
    async parse() {
      return ok({ pluginId: overrides.id, path: "x", ast: null });
    },
    extractSymbols: () => ok({ symbols: [] }),
    extractImports: () => ok({ imports: [] }),
    extractExports: () => ok({ exports: [] }),
    extractReferences: () => ok({ references: [] }),
    ...overrides,
  };
}

describe("PluginRegistry", () => {
  it("registers and lists plugins", () => {
    const registry = new PluginRegistry();
    const registered = registry.register(createNoopPlugin());
    expect(registered.ok).toBe(true);
    expect(registry.list()).toEqual([
      expect.objectContaining({
        id: "noop",
        extensions: [".noop"],
        spiVersion: ANALYZER_SPI_VERSION,
      }),
    ]);
  });

  it("resolves by extension and path", () => {
    const registry = new PluginRegistry();
    registry.register(createNoopPlugin());
    expect(registry.resolveByExtension("noop")?.id).toBe("noop");
    expect(registry.resolveByExtension(".NOOP")?.id).toBe("noop");
    expect(registry.resolveForPath("/tmp/fixture.noop")?.id).toBe("noop");
    expect(registry.resolveForPath("/tmp/file.ts")).toBeUndefined();
  });

  it("rejects duplicate plugin ids", () => {
    const registry = new PluginRegistry();
    expect(registry.register(createNoopPlugin()).ok).toBe(true);
    const again = registry.register(createNoopPlugin());
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe(PrismErrorCode.VALIDATION);
  });

  it("rejects extension conflicts", () => {
    const registry = new PluginRegistry();
    expect(registry.register(createNoopPlugin()).ok).toBe(true);
    const conflict = registry.register(
      stubPlugin({ id: "other", extensions: [".noop"] }),
    );
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.error.code).toBe(PrismErrorCode.VALIDATION);
    expect(conflict.error.message).toContain(".noop");
  });

  it("rejects incompatible spiVersion", () => {
    const registry = new PluginRegistry();
    const bad = registry.register(
      stubPlugin({ id: "future", extensions: [".fut"], spiVersion: 99 }),
    );
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe(PrismErrorCode.UNSUPPORTED);
  });
});
