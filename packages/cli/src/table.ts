/**
 * Tables and bands for human output (M-029).
 *
 * Twenty commands print lists of things. Without one renderer they would drift
 * into twenty layouts, and the risk colouring would drift into a fourth set of
 * thresholds — which is the exact problem M-051 Phase 3 solved by putting
 * `riskToBand` in `@repo-prism/shared`. This module is the only place in the CLI
 * that turns a score into a word or a colour, and it asks Core's helper.
 */

import { riskBandDescriptor, type RiskBand } from "@repo-prism/shared";
import { paint, stripAnsi, type Style } from "./output.js";

/** Fallback width when stdout is not a terminal — the classic terminal. */
export const DEFAULT_WIDTH = 80;

/**
 * How wide to render.
 *
 * `COLUMNS` is checked before the TTY so that tests and `COLUMNS=80 prism …`
 * can pin the layout. A pipe has no width, so it gets the default rather than
 * an unbounded line.
 */
export function terminalWidth(
  env: NodeJS.ProcessEnv,
  columns?: number,
): number {
  const declared = Number.parseInt(env.COLUMNS ?? "", 10);
  if (Number.isFinite(declared) && declared > 0) return declared;
  if (columns !== undefined && columns > 0) return columns;
  return DEFAULT_WIDTH;
}

export type Column = {
  readonly header: string;
  /** Right-align numbers so they can be compared by eye. */
  readonly align?: "left" | "right";
  /**
   * Which column gives up space when the table is too wide. Exactly one column
   * should flex; paths are the usual choice because their tail is the
   * informative part.
   */
  readonly flex?: boolean;
};

export type Cell = {
  readonly text: string;
  /** Explicitly `undefined` is allowed: styles usually come from a lookup. */
  readonly style?: Style | undefined;
};

export type TableOptions = {
  readonly columns: readonly Column[];
  readonly rows: readonly (readonly Cell[])[];
  readonly color: boolean;
  readonly width?: number;
};

/**
 * Render an aligned table that fits the terminal.
 *
 * Columns are sized to their content, then the flexible column is squeezed
 * until the row fits. Cells are measured after ANSI is stripped, because an
 * escape sequence takes zero columns on screen but eleven in a string, and
 * padding by string length is how coloured tables end up ragged.
 */
export function renderTable(options: TableOptions): string {
  const { columns, rows, color } = options;
  if (rows.length === 0) return "";

  const width = options.width ?? DEFAULT_WIDTH;
  const gap = 2;

  const natural = columns.map((column, index) =>
    Math.max(
      visibleWidth(column.header),
      ...rows.map((row) => visibleWidth(row[index]?.text ?? "")),
    ),
  );

  const totalGaps = gap * Math.max(0, columns.length - 1);
  const overflow = natural.reduce((sum, n) => sum + n, 0) + totalGaps - width;
  const flexIndex = columns.findIndex((column) => column.flex);
  if (overflow > 0 && flexIndex !== -1) {
    // Below about a dozen characters a truncated path says nothing at all, so
    // we stop shrinking and accept a wrapped line over an unreadable one.
    const floor = 12;
    natural[flexIndex] = Math.max(
      floor,
      (natural[flexIndex] ?? floor) - overflow,
    );
  }

  const header = columns
    .map((column, index) =>
      pad(column.header, natural[index] ?? 0, column.align),
    )
    .join(" ".repeat(gap))
    .trimEnd();

  const body = rows.map((row) =>
    columns
      .map((column, index) => {
        const cell = row[index] ?? { text: "" };
        const size = natural[index] ?? 0;
        const text = truncate(cell.text, size, column.flex === true);
        const painted = cell.style ? paint(text, cell.style, color) : text;
        return padPainted(painted, text, size, column.align);
      })
      .join(" ".repeat(gap))
      .trimEnd(),
  );

  return [paint(header, "dim", color), ...body].join("\n");
}

/**
 * Truncate to fit. Flexible columns hold paths, and the end of a path is what
 * identifies it, so those lose their head rather than their tail.
 */
export function truncate(
  text: string,
  size: number,
  fromStart = false,
): string {
  if (text.length <= size) return text;
  if (size <= 1) return text.slice(0, size);
  return fromStart
    ? `…${text.slice(text.length - (size - 1))}`
    : `${text.slice(0, size - 1)}…`;
}

function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

/**
 * Wrap prose to the terminal.
 *
 * Summaries and advisory notes come from Core as single sentences of arbitrary
 * length. Left alone they rely on the terminal's own wrapping, which breaks
 * mid-word and ignores the indent, so a two-line note becomes a ragged block.
 */
export function wrap(text: string, width: number, indent = ""): string[] {
  // The floor guards against a pathological width producing one character per
  // line; it is low enough that any plausible terminal is honoured exactly.
  const limit = Math.max(8, width - indent.length);
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (current === "") {
        current = word;
      } else if (current.length + 1 + word.length <= limit) {
        current = `${current} ${word}`;
      } else {
        lines.push(`${indent}${current}`);
        current = word;
      }
    }
    lines.push(`${indent}${current}`);
  }

  return lines;
}

function pad(text: string, size: number, align?: "left" | "right"): string {
  return align === "right" ? text.padStart(size) : text.padEnd(size);
}

/** Pad by the *visible* length, so colour never shifts a column. */
function padPainted(
  painted: string,
  plain: string,
  size: number,
  align?: "left" | "right",
): string {
  const fill = " ".repeat(Math.max(0, size - plain.length));
  return align === "right" ? `${fill}${painted}` : `${painted}${fill}`;
}

const BAND_STYLE: Record<RiskBand, Style> = {
  high: "red",
  mid: "yellow",
  low: "green",
};

/** A risk score as a cell: the number, coloured by the shared band. */
export function scoreCell(score: number): Cell {
  return {
    text: String(Math.round(score)),
    style: BAND_STYLE[riskBandDescriptor(score).id],
  };
}

/**
 * A *quality* score, where 100 is good and risk bands run the other way.
 *
 * The number printed is the real one. Only the colour is inverted, because
 * showing `100 - score` under a column headed SCORE — which an earlier draft
 * of this did — makes a perfectly healthy factor read as zero.
 */
export function qualityCell(score: number): Cell {
  return {
    text: String(Math.round(score)),
    style: BAND_STYLE[riskBandDescriptor(100 - score).id],
  };
}

/** A score as `High`, `Moderate` or `Low`, worded and coloured by the band. */
export function bandCell(score: number): Cell {
  const band = riskBandDescriptor(score);
  return { text: band.short, style: BAND_STYLE[band.id] };
}

export function bandStyle(band: RiskBand): Style {
  return BAND_STYLE[band];
}

/**
 * Health grades run A–F rather than 0–100, so they are banded by letter. Kept
 * beside the risk bands so the two colour schemes stay legible together: a
 * green grade and a green risk must not mean opposite things.
 */
export function gradeStyle(grade: string): Style {
  if (grade === "A" || grade === "B") return "green";
  if (grade === "C") return "yellow";
  return "red";
}

/** `3 files` / `1 file`, because "1 files" reads like a bug. */
export function plural(
  count: number,
  singular: string,
  plural_?: string,
): string {
  return `${count} ${count === 1 ? singular : (plural_ ?? `${singular}s`)}`;
}
