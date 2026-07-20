/** @prism/analyzer — language plugin SPI + host (M-004). */

export {
  ANALYZER_SPI_VERSION,
  ANALYZER_SPI_VERSION_MAX,
  ANALYZER_SPI_VERSION_MIN,
} from "./spi-version.js";
export type {
  ExtractedImport,
  ExtractedSymbol,
  ImportExtraction,
  LanguagePlugin,
  LanguagePluginCapabilities,
  LanguagePluginInfo,
  ParseInput,
  ParseResult,
  SymbolExtraction,
} from "./types.js";
export { PluginRegistry } from "./registry.js";
export { createNoopPlugin } from "./noop-plugin.js";
export {
  createAnalyzerHost,
  type AnalyzerHost,
  type AnalyzerHostOptions,
} from "./host.js";
