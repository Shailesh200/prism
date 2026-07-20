import type { PrismError, Result } from "@prism/shared";

/** Declared capabilities for negotiation with the host. */
export type LanguagePluginCapabilities = {
  readonly detect: boolean;
  readonly parse: boolean;
  readonly extractSymbols: boolean;
  readonly extractImports: boolean;
};

export type ParseInput = {
  readonly path: string;
  readonly content: string;
};

/**
 * Opaque parse output — plugins own the `ast` shape.
 * Downstream extractors only accept results from the same plugin.
 */
export type ParseResult = {
  readonly pluginId: string;
  readonly path: string;
  readonly ast: unknown;
};

export type ExtractedSymbol = {
  readonly name: string;
  readonly kind: string;
  readonly start: number;
  readonly end: number;
};

export type ExtractedImport = {
  readonly source: string;
  readonly specifiers: readonly string[];
};

export type SymbolExtraction = {
  readonly symbols: readonly ExtractedSymbol[];
};

export type ImportExtraction = {
  readonly imports: readonly ExtractedImport[];
};

/**
 * Language plugin SPI — Core never sees parser internals.
 * Real TypeScript plugin lands in M-006 (Oxc).
 */
export type LanguagePlugin = {
  readonly id: string;
  readonly spiVersion: number;
  readonly extensions: readonly string[];
  readonly capabilities: LanguagePluginCapabilities;
  /** Return true if this plugin should handle the file. */
  detect(input: { path: string; content?: string }): boolean;
  parse(input: ParseInput): Promise<Result<ParseResult, PrismError>>;
  extractSymbols(
    parseResult: ParseResult,
  ): Result<SymbolExtraction, PrismError>;
  extractImports(
    parseResult: ParseResult,
  ): Result<ImportExtraction, PrismError>;
};

/** JSON-serializable plugin descriptor for Core / MCP. */
export type LanguagePluginInfo = {
  readonly id: string;
  readonly spiVersion: number;
  readonly extensions: readonly string[];
  readonly capabilities: LanguagePluginCapabilities;
};
