/**
 * `graph.json` and `GRAPH_REPORT.md` (M-096, ADR-0062). The export is the
 * versioned, documented form of Prism's graph; the report lists only what was
 * measured, so every line can be checked against the code.
 */

import type { GraphProvenance } from "./graph-query.js";

export const GRAPH_EXPORT_VERSION = 1 as const;

export type GraphExportNode = {
  /** `package:<id>`, `file:<path>`, `symbol:<path>#<name>`, or `adr:<path>`. */
  readonly id: string;
  readonly kind: "package" | "file" | "test" | "symbol" | "adr";
  readonly label: string;
  readonly path?: string;
  /** Owning package id, for files and symbols. */
  readonly package?: string;
};

export type GraphExportEdge = {
  readonly kind:
    | "contains"
    | "imports"
    | "tests"
    | "declares"
    | "rationale_for";
  readonly from: string;
  readonly to: string;
  readonly provenance: GraphProvenance;
};

export type GraphExport = {
  readonly version: typeof GRAPH_EXPORT_VERSION;
  readonly generatedAt: string;
  readonly indexedAt: string;
  /** Folder name only: the export is meant to be shareable. */
  readonly repository: string;
  readonly nodes: readonly GraphExportNode[];
  readonly edges: readonly GraphExportEdge[];
  readonly stats: {
    readonly packages: number;
    readonly files: number;
    readonly tests: number;
    readonly symbols: number;
    readonly edges: number;
  };
};

export type GraphReportData = {
  readonly repository: string;
  readonly indexedAt: string;
  /** Most connected files by import degree (in + out). */
  readonly connected: readonly {
    readonly path: string;
    readonly importedBy: number;
    readonly imports: number;
  }[];
  readonly cycles: readonly (readonly string[])[];
  /** Non-test source files no resolved import reaches, with no imports of their own. */
  readonly orphans: readonly string[];
  /** Most imported files that no test reaches, directly or through dependents. */
  readonly untestedHotspots: readonly {
    readonly path: string;
    readonly importedBy: number;
  }[];
  /** Package pairs joined by a single import: easy to miss, often accidental. */
  readonly loneCrossPackage: readonly {
    readonly from: string;
    readonly to: string;
    readonly fromPackage: string;
    readonly toPackage: string;
  }[];
};

function list<T>(rows: readonly T[], empty: string, line: (row: T) => string) {
  return rows.length === 0
    ? [`_${empty}_`]
    : rows.map((row) => `- ${line(row)}`);
}

const code = (value: string) => `\`${value}\``;

export function renderGraphReport(data: GraphReportData): string {
  const lines = [
    `# Prism graph report — ${data.repository}`,
    "",
    `Indexed ${data.indexedAt}. Every entry below is measured from imports and test reach; nothing is inferred.`,
    "",
    "## Most connected files",
    "",
    ...list(
      data.connected,
      "No imports found.",
      (row) =>
        `${code(row.path)} — imported by ${row.importedBy}, imports ${row.imports}`,
    ),
    "",
    "## Import cycles",
    "",
    ...list(data.cycles, "No cycles.", (cycle) =>
      [...cycle, cycle[0] ?? ""].map(code).join(" → "),
    ),
    "",
    "## Most imported files no test reaches",
    "",
    ...list(
      data.untestedHotspots,
      "Every heavily imported file is reached by a test.",
      (row) => `${code(row.path)} — imported by ${row.importedBy}`,
    ),
    "",
    "## Cross-package imports that stand alone",
    "",
    ...list(
      data.loneCrossPackage,
      "No package pair is joined by a single import.",
      (row) =>
        `${code(row.from)} → ${code(row.to)} (the only import from ${row.fromPackage} into ${row.toPackage})`,
    ),
    "",
    "## Orphans",
    "",
    ...list(
      data.orphans,
      "No orphan source files.",
      (path) =>
        `${code(path)} — no resolved import reaches it, and it imports nothing`,
    ),
    "",
    "## Questions this graph can answer",
    "",
  ];
  const first = data.connected[0]?.path;
  const second = data.connected[1]?.path;
  const hotspot = data.untestedHotspots[0]?.path;
  const questions = [
    first ? `What breaks if I change ${code(first)}?` : null,
    first && second ? `How does ${code(first)} reach ${code(second)}?` : null,
    hotspot ? `Which tests should cover ${code(hotspot)}?` : null,
    data.cycles[0]
      ? `How do I break the cycle through ${code(data.cycles[0][0] ?? "")}?`
      : null,
    "Which files in this folder import the most connected module?",
  ].filter((q): q is string => q !== null);
  lines.push(...questions.slice(0, 5).map((q) => `- ${q}`), "");
  return lines.join("\n");
}
