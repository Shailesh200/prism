import type { PrismError, Result } from "@prism/shared";

/** Declared capabilities for negotiation with the host. */
export type LanguagePluginCapabilities = {
  readonly detect: boolean;
  readonly parse: boolean;
  readonly extractSymbols: boolean;
  readonly extractImports: boolean;
  readonly extractExports: boolean;
  readonly extractReferences: boolean;
};

export type ParseInput = {
  readonly path: string;
  readonly content: string;
};

/** File-level diagnostic from a parser (no throw). */
export type ParseDiagnostic = {
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly start?: number;
  readonly end?: number;
};

/**
 * Opaque parse output — plugins own the `ast` shape.
 * Downstream extractors only accept results from the same plugin.
 */
export type ParseResult = {
  readonly pluginId: string;
  readonly path: string;
  readonly ast: unknown;
  readonly diagnostics?: readonly ParseDiagnostic[];
};

export type ExtractedSymbol = {
  readonly name: string;
  readonly kind: string;
  readonly start: number;
  readonly end: number;
  /** True when the symbol is part of an export declaration. */
  readonly exported?: boolean;
};

export type ExtractedImport = {
  readonly source: string;
  readonly specifiers: readonly string[];
  readonly start?: number;
  readonly end?: number;
};

export type ExtractedExport = {
  readonly name: string;
  readonly kind: string;
  readonly start?: number;
  readonly end?: number;
  /** Present for re-exports (`export … from`). */
  readonly source?: string;
};

/** Lightweight reference hint for later graphs (not type-accurate). */
export type ExtractedReference = {
  readonly name: string;
  readonly kind: string;
  readonly start: number;
  readonly end: number;
};

export type SymbolExtraction = {
  readonly symbols: readonly ExtractedSymbol[];
};

export type ImportExtraction = {
  readonly imports: readonly ExtractedImport[];
};

export type ExportExtraction = {
  readonly exports: readonly ExtractedExport[];
};

export type ReferenceExtraction = {
  readonly references: readonly ExtractedReference[];
};

/**
 * Language plugin SPI — Core never sees parser internals.
 * TypeScript/JS plugin uses Oxc (M-006); deep TS optional later.
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
  extractExports(
    parseResult: ParseResult,
  ): Result<ExportExtraction, PrismError>;
  extractReferences(
    parseResult: ParseResult,
  ): Result<ReferenceExtraction, PrismError>;
};

/** JSON-serializable plugin descriptor for Core / MCP. */
export type LanguagePluginInfo = {
  readonly id: string;
  readonly spiVersion: number;
  readonly extensions: readonly string[];
  readonly capabilities: LanguagePluginCapabilities;
};
