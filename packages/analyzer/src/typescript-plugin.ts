import { basename } from "node:path";
import { parseSync, type ParserOptions } from "oxc-parser";
import {
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@repo-prism/shared";
import { ANALYZER_SPI_VERSION } from "./spi-version.js";
import type {
  ExtractedExport,
  ExtractedImport,
  ExtractedReference,
  ExtractedSymbol,
  ExportExtraction,
  ImportExtraction,
  LanguagePlugin,
  ParseDiagnostic,
  ParseInput,
  ParseResult,
  ReferenceExtraction,
  SymbolExtraction,
} from "./types.js";

export const TYPESCRIPT_PLUGIN_ID = "typescript" as const;

const EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

type OxcAst = {
  readonly program: unknown;
  readonly module: unknown;
  readonly diagnostics: readonly ParseDiagnostic[];
};

type PosNode = {
  readonly type?: string;
  readonly start?: number;
  readonly end?: number;
  readonly name?: string;
  readonly id?: PosNode | null;
  readonly declaration?: PosNode | null;
  readonly declarations?: readonly PosNode[];
  readonly specifiers?: readonly PosNode[];
  readonly exported?: PosNode;
  readonly local?: PosNode;
  readonly body?: PosNode | readonly PosNode[];
  readonly callee?: PosNode;
  readonly object?: PosNode;
  readonly property?: PosNode;
  readonly expression?: PosNode;
  readonly argument?: PosNode;
  readonly arguments?: readonly PosNode[];
  readonly init?: PosNode | null;
  readonly key?: PosNode;
  readonly value?: PosNode;
  readonly elements?: readonly (PosNode | null)[];
  readonly properties?: readonly PosNode[];
  readonly params?: readonly PosNode[];
  readonly cases?: readonly PosNode[];
  readonly consequent?: PosNode | readonly PosNode[];
  readonly alternate?: PosNode | null;
  readonly block?: PosNode;
  readonly handler?: PosNode | null;
  readonly finalizer?: PosNode | null;
  readonly discriminant?: PosNode;
  readonly test?: PosNode | null;
  readonly left?: PosNode;
  readonly right?: PosNode;
  readonly superClass?: PosNode | null;
  readonly implements?: readonly PosNode[];
  readonly extends?: readonly PosNode[] | PosNode | null;
  readonly source?: PosNode | null;
};

function extensionOf(path: string): string {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

function langForPath(path: string): NonNullable<ParserOptions["lang"]> {
  switch (extensionOf(path)) {
    case ".tsx":
      return "tsx";
    case ".jsx":
      return "jsx";
    case ".ts":
    case ".mts":
    case ".cts":
      return "ts";
    default:
      return "js";
  }
}

function ensureOwnParse(parseResult: ParseResult): Result<OxcAst, PrismError> {
  if (parseResult.pluginId !== TYPESCRIPT_PLUGIN_ID) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        "typescript extractors only accept typescript ParseResult",
        { pluginId: parseResult.pluginId },
      ),
    );
  }
  const ast = parseResult.ast as OxcAst | null;
  if (!ast || typeof ast !== "object" || !("program" in ast)) {
    return err(
      prismError(
        PrismErrorCode.ANALYZER_FAILED,
        "typescript ParseResult is missing Oxc AST payload",
        { path: parseResult.path },
      ),
    );
  }
  return ok(ast);
}

function range(node: PosNode | null | undefined): {
  start: number;
  end: number;
} {
  return {
    start: typeof node?.start === "number" ? node.start : 0,
    end: typeof node?.end === "number" ? node.end : 0,
  };
}

function pushSymbol(
  out: ExtractedSymbol[],
  name: string | undefined,
  kind: string,
  node: PosNode | null | undefined,
  exported: boolean,
): void {
  if (!name) return;
  const { start, end } = range(node);
  out.push({ name, kind, start, end, exported });
}

function collectFromDeclaration(
  decl: PosNode | null | undefined,
  exported: boolean,
  out: ExtractedSymbol[],
): void {
  if (!decl?.type) return;
  switch (decl.type) {
    case "FunctionDeclaration":
      pushSymbol(out, decl.id?.name, "function", decl, exported);
      break;
    case "ClassDeclaration":
      pushSymbol(out, decl.id?.name, "class", decl, exported);
      break;
    case "TSInterfaceDeclaration":
      pushSymbol(out, decl.id?.name, "interface", decl, exported);
      break;
    case "TSTypeAliasDeclaration":
      pushSymbol(out, decl.id?.name, "type", decl, exported);
      break;
    case "TSEnumDeclaration":
      pushSymbol(out, decl.id?.name, "enum", decl, exported);
      break;
    case "VariableDeclaration":
      for (const d of decl.declarations ?? []) {
        if (d.id?.type === "Identifier") {
          pushSymbol(out, d.id.name, "variable", d, exported);
        }
      }
      break;
    default:
      break;
  }
}

function extractSymbolsFromProgram(program: unknown): ExtractedSymbol[] {
  const body = (program as { body?: readonly PosNode[] } | null)?.body ?? [];
  const out: ExtractedSymbol[] = [];

  for (const node of body) {
    switch (node.type) {
      case "FunctionDeclaration":
      case "ClassDeclaration":
      case "TSInterfaceDeclaration":
      case "TSTypeAliasDeclaration":
      case "TSEnumDeclaration":
      case "VariableDeclaration":
        collectFromDeclaration(node, false, out);
        break;
      case "ExportNamedDeclaration":
        if (node.declaration) {
          collectFromDeclaration(node.declaration, true, out);
        }
        for (const spec of node.specifiers ?? []) {
          const name = spec.exported?.name ?? spec.local?.name;
          pushSymbol(out, name, "export", spec, true);
        }
        break;
      case "ExportDefaultDeclaration": {
        const decl = node.declaration;
        if (
          decl &&
          (decl.type === "FunctionDeclaration" ||
            decl.type === "ClassDeclaration") &&
          decl.id?.name
        ) {
          pushSymbol(out, decl.id.name, "default", decl, true);
        } else {
          pushSymbol(out, "default", "default", node, true);
        }
        break;
      }
      default:
        break;
    }
  }

  return out;
}

type StaticImport = {
  readonly start?: number;
  readonly end?: number;
  readonly moduleRequest?: { readonly value?: string };
  readonly entries?: readonly {
    readonly localName?: { readonly value?: string };
    readonly importName?: { readonly kind?: string; readonly name?: string };
  }[];
};

type StaticExport = {
  readonly start?: number;
  readonly end?: number;
  readonly entries?: readonly {
    readonly start?: number;
    readonly end?: number;
    readonly moduleRequest?: { readonly value?: string } | null;
    readonly exportName?: { readonly kind?: string; readonly name?: string };
    readonly localName?: { readonly kind?: string; readonly name?: string };
    readonly importName?: { readonly kind?: string; readonly name?: string };
  }[];
};

function extractImportsFromModule(module: unknown): ExtractedImport[] {
  const staticImports =
    (module as { staticImports?: readonly StaticImport[] } | null)
      ?.staticImports ?? [];
  return staticImports.map((imp) => {
    const specifiers = (imp.entries ?? [])
      .map((e) => {
        if (e.localName?.value) return e.localName.value;
        if (e.importName?.kind === "Default") return "default";
        if (e.importName?.kind === "Namespace") return "*";
        return e.importName?.name ?? "";
      })
      .filter(Boolean);
    const row: ExtractedImport = {
      source: imp.moduleRequest?.value ?? "",
      specifiers,
    };
    if (typeof imp.start === "number") {
      return {
        ...row,
        start: imp.start,
        ...(typeof imp.end === "number" ? { end: imp.end } : {}),
      };
    }
    if (typeof imp.end === "number") {
      return { ...row, end: imp.end };
    }
    return row;
  });
}

/** Static-string `import("…")` from the Oxc program AST (hard graph enrichment). */
function extractDynamicImportsFromProgram(program: unknown): ExtractedImport[] {
  const out: ExtractedImport[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as {
      type?: string;
      start?: number;
      end?: number;
      source?: { type?: string; value?: unknown };
    };
    if (n.type === "ImportExpression") {
      const src = n.source;
      const lit =
        src && src.type === "Literal" && typeof src.value === "string"
          ? src.value
          : null;
      if (lit && lit.length > 0) {
        const row: ExtractedImport = {
          source: lit,
          specifiers: [],
        };
        if (typeof n.start === "number") {
          out.push({
            ...row,
            start: n.start,
            ...(typeof n.end === "number" ? { end: n.end } : {}),
          });
        } else {
          out.push(row);
        }
      }
    }
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
      } else if (
        value &&
        typeof value === "object" &&
        "type" in (value as object)
      ) {
        walk(value);
      }
    }
  };
  walk(program);
  return out;
}

function extractExportsFromModule(module: unknown): ExtractedExport[] {
  const staticExports =
    (module as { staticExports?: readonly StaticExport[] } | null)
      ?.staticExports ?? [];
  const out: ExtractedExport[] = [];
  for (const block of staticExports) {
    for (const entry of block.entries ?? []) {
      const kind = entry.exportName?.kind ?? "Name";
      let name = entry.exportName?.name;
      if (kind === "Default" || (!name && kind === "None")) {
        name =
          kind === "Default"
            ? "default"
            : (entry.localName?.name ?? entry.importName?.name ?? "default");
      }
      if (kind === "All") name = "*";
      if (!name) continue;
      const start = entry.start ?? block.start;
      const end = entry.end ?? block.end;
      const source = entry.moduleRequest?.value;
      out.push({
        name,
        kind: kind.toLowerCase(),
        ...(typeof start === "number" ? { start } : {}),
        ...(typeof end === "number" ? { end } : {}),
        ...(source !== undefined ? { source } : {}),
      });
    }
  }
  return out;
}

function pushNamedRef(
  out: ExtractedReference[],
  name: string | undefined,
  kind: string,
  node: PosNode | null | undefined,
): void {
  if (!name) return;
  const { start, end } = range(node);
  out.push({ name, kind, start, end });
}

function heritageIdentifier(node: PosNode | null | undefined): PosNode | null {
  if (!node) return null;
  if (node.type === "Identifier") return node;
  if (node.expression?.type === "Identifier") return node.expression;
  return null;
}

function walkReferences(node: unknown, out: ExtractedReference[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as PosNode;

  if (n.type === "CallExpression" && n.callee?.type === "Identifier") {
    pushNamedRef(out, n.callee.name, "call", n.callee);
  }

  if (n.type === "ClassDeclaration" || n.type === "ClassExpression") {
    const superId = heritageIdentifier(n.superClass);
    pushNamedRef(out, superId?.name, "extends", superId);
    for (const impl of n.implements ?? []) {
      const id = heritageIdentifier(impl);
      pushNamedRef(out, id?.name, "implements", id);
    }
  }

  if (n.type === "TSInterfaceDeclaration") {
    const ext = n.extends;
    const list = Array.isArray(ext) ? ext : ext ? [ext] : [];
    for (const item of list) {
      const id = heritageIdentifier(item);
      pushNamedRef(out, id?.name, "extends", id);
    }
  }

  for (const value of Object.values(n)) {
    if (Array.isArray(value)) {
      for (const item of value) walkReferences(item, out);
    } else if (
      value &&
      typeof value === "object" &&
      "type" in (value as object)
    ) {
      walkReferences(value, out);
    }
  }
}

function mapDiagnostics(
  errors: readonly {
    severity?: string;
    message?: string;
    labels?: readonly { start?: number; end?: number }[];
  }[],
): ParseDiagnostic[] {
  return errors.map((e) => {
    const label = e.labels?.[0];
    const severity =
      e.severity?.toLowerCase() === "warning" ? "warning" : "error";
    return {
      severity,
      message: e.message ?? "Parse error",
      ...(typeof label?.start === "number" ? { start: label.start } : {}),
      ...(typeof label?.end === "number" ? { end: label.end } : {}),
    };
  });
}

/** Oxc-backed TypeScript / JavaScript / JSX language plugin (M-006). */
export function createTypescriptPlugin(): LanguagePlugin {
  return {
    id: TYPESCRIPT_PLUGIN_ID,
    spiVersion: ANALYZER_SPI_VERSION,
    extensions: [...EXTENSIONS],
    capabilities: {
      detect: true,
      parse: true,
      extractSymbols: true,
      extractImports: true,
      extractExports: true,
      extractReferences: true,
    },
    detect(input) {
      return EXTENSIONS.includes(
        extensionOf(input.path) as (typeof EXTENSIONS)[number],
      );
    },
    async parse(input: ParseInput) {
      if (
        !EXTENSIONS.includes(
          extensionOf(input.path) as (typeof EXTENSIONS)[number],
        )
      ) {
        return err(
          prismError(
            PrismErrorCode.ANALYZER_FAILED,
            `typescript plugin does not handle path: ${input.path}`,
            { path: input.path },
          ),
        );
      }

      try {
        const result = parseSync(input.path, input.content, {
          lang: langForPath(input.path),
        });
        const diagnostics = mapDiagnostics(result.errors ?? []);
        return ok({
          pluginId: TYPESCRIPT_PLUGIN_ID,
          path: input.path,
          ast: {
            program: result.program,
            module: result.module,
            diagnostics,
          } satisfies OxcAst,
          diagnostics,
        });
      } catch (cause) {
        return err(
          prismError(
            PrismErrorCode.ANALYZER_FAILED,
            `Oxc parse threw for ${input.path}`,
            { path: input.path, cause: String(cause) },
          ),
        );
      }
    },
    extractSymbols(parseResult) {
      const gate = ensureOwnParse(parseResult);
      if (!gate.ok) return gate;
      const symbols = extractSymbolsFromProgram(gate.value.program);
      const extraction: SymbolExtraction = { symbols };
      return ok(extraction);
    },
    extractImports(parseResult) {
      const gate = ensureOwnParse(parseResult);
      if (!gate.ok) return gate;
      const staticOnes = extractImportsFromModule(gate.value.module);
      const dynamicOnes = extractDynamicImportsFromProgram(gate.value.program);
      // Dedupe by source+start
      const seen = new Set<string>();
      const imports: ExtractedImport[] = [];
      for (const imp of [...staticOnes, ...dynamicOnes]) {
        const key = `${imp.source}\0${imp.start ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        imports.push(imp);
      }
      const extraction: ImportExtraction = { imports };
      return ok(extraction);
    },
    extractExports(parseResult) {
      const gate = ensureOwnParse(parseResult);
      if (!gate.ok) return gate;
      const exports = extractExportsFromModule(gate.value.module);
      const extraction: ExportExtraction = { exports };
      return ok(extraction);
    },
    extractReferences(parseResult) {
      const gate = ensureOwnParse(parseResult);
      if (!gate.ok) return gate;
      const references: ExtractedReference[] = [];
      walkReferences(gate.value.program, references);
      const extraction: ReferenceExtraction = { references };
      return ok(extraction);
    },
  };
}
