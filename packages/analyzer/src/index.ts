/** @prism/analyzer — language plugin SPI + host (M-004 / M-006). */

export {
  ANALYZER_SPI_VERSION,
  ANALYZER_SPI_VERSION_MAX,
  ANALYZER_SPI_VERSION_MIN,
} from "./spi-version.js";
export type {
  ExtractedExport,
  ExtractedImport,
  ExtractedReference,
  ExtractedSymbol,
  ExportExtraction,
  ImportExtraction,
  LanguagePlugin,
  LanguagePluginCapabilities,
  LanguagePluginInfo,
  ParseDiagnostic,
  ParseInput,
  ParseResult,
  ReferenceExtraction,
  SymbolExtraction,
} from "./types.js";
export { PluginRegistry } from "./registry.js";
export { createNoopPlugin } from "./noop-plugin.js";
export {
  createTypescriptPlugin,
  TYPESCRIPT_PLUGIN_ID,
} from "./typescript-plugin.js";
export {
  createAnalyzerHost,
  type AnalyzerHost,
  type AnalyzerHostOptions,
  type FileAnalysis,
} from "./host.js";
