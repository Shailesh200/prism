import {
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@prism/shared";
import {
  ANALYZER_SPI_VERSION_MAX,
  ANALYZER_SPI_VERSION_MIN,
} from "./spi-version.js";
import type { LanguagePlugin, LanguagePluginInfo } from "./types.js";

function normalizeExtension(ext: string): string {
  const trimmed = ext.trim().toLowerCase();
  if (!trimmed) return trimmed;
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function toInfo(plugin: LanguagePlugin): LanguagePluginInfo {
  return {
    id: plugin.id,
    spiVersion: plugin.spiVersion,
    extensions: [...plugin.extensions],
    capabilities: { ...plugin.capabilities },
  };
}

/**
 * Negotiates SPI version + registers plugins.
 * Extension ownership is exclusive — first registered plugin wins; later conflicts fail.
 */
export class PluginRegistry {
  private readonly byId = new Map<string, LanguagePlugin>();
  private readonly byExtension = new Map<string, string>();

  register(plugin: LanguagePlugin): Result<LanguagePluginInfo, PrismError> {
    const id = plugin.id.trim();
    if (!id) {
      return err(
        prismError(PrismErrorCode.VALIDATION, "Plugin id must be non-empty"),
      );
    }

    if (
      plugin.spiVersion < ANALYZER_SPI_VERSION_MIN ||
      plugin.spiVersion > ANALYZER_SPI_VERSION_MAX
    ) {
      return err(
        prismError(
          PrismErrorCode.UNSUPPORTED,
          `Plugin "${id}" spiVersion ${plugin.spiVersion} outside host range ${ANALYZER_SPI_VERSION_MIN}–${ANALYZER_SPI_VERSION_MAX}`,
          {
            pluginId: id,
            spiVersion: plugin.spiVersion,
            min: ANALYZER_SPI_VERSION_MIN,
            max: ANALYZER_SPI_VERSION_MAX,
          },
        ),
      );
    }

    if (this.byId.has(id)) {
      return err(
        prismError(
          PrismErrorCode.VALIDATION,
          `Plugin id "${id}" is already registered`,
          { pluginId: id },
        ),
      );
    }

    const extensions = plugin.extensions.map(normalizeExtension);
    if (extensions.some((e) => !e)) {
      return err(
        prismError(
          PrismErrorCode.VALIDATION,
          `Plugin "${id}" has an empty extension entry`,
          { pluginId: id },
        ),
      );
    }

    for (const ext of extensions) {
      const owner = this.byExtension.get(ext);
      if (owner !== undefined) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            `Extension "${ext}" already claimed by plugin "${owner}"`,
            { extension: ext, owner, conflictId: id },
          ),
        );
      }
    }

    const normalized: LanguagePlugin = {
      ...plugin,
      id,
      extensions,
    };
    this.byId.set(id, normalized);
    for (const ext of extensions) {
      this.byExtension.set(ext, id);
    }
    return ok(toInfo(normalized));
  }

  resolveById(id: string): LanguagePlugin | undefined {
    return this.byId.get(id);
  }

  resolveByExtension(extension: string): LanguagePlugin | undefined {
    const id = this.byExtension.get(normalizeExtension(extension));
    if (id === undefined) return undefined;
    return this.byId.get(id);
  }

  resolveForPath(path: string): LanguagePlugin | undefined {
    const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    const base = slash >= 0 ? path.slice(slash + 1) : path;
    const dot = base.lastIndexOf(".");
    if (dot <= 0) return undefined;
    return this.resolveByExtension(base.slice(dot));
  }

  list(): readonly LanguagePluginInfo[] {
    return [...this.byId.values()].map(toInfo);
  }
}
