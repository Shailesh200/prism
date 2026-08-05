/**
 * Output rendering (M-028).
 *
 * Two rules hold everything else together:
 *
 * 1. **stdout carries data.** Progress, warnings and diagnostics go to stderr,
 *    so `prism dna --json | jq` works without the user thinking about it.
 * 2. **Colour is a property of the terminal, not the command.** Piped output is
 *    never styled, `NO_COLOR` is honoured, and no command decides for itself.
 */

import type { PrismError } from "@prism/shared";

export type OutputOptions = {
  readonly json: boolean;
  readonly color: boolean;
  readonly quiet: boolean;
  /** Columns available for tables. Resolved once, in the runtime. */
  readonly width: number;
};

/**
 * The JSON envelope. Deliberately the same shape Core and MCP use: three
 * surfaces, one contract, so a script written against one reads the others.
 */
export type JsonEnvelope =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly error: PrismError };

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  red: "\u001B[31m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  cyan: "\u001B[36m",
} as const;

export type Style = keyof Omit<typeof ANSI, "reset">;

/**
 * Whether to emit ANSI at all.
 *
 * `NO_COLOR` wins over everything including `--color`, because the point of the
 * convention is that a user can set it once and stop thinking about it.
 */
export function shouldUseColor(options: {
  readonly noColorFlag: boolean;
  readonly env: NodeJS.ProcessEnv;
  readonly isTty: boolean;
}): boolean {
  if (options.env.NO_COLOR !== undefined) return false;
  if (options.noColorFlag) return false;
  return options.isTty;
}

export function paint(text: string, style: Style, enabled: boolean): string {
  return enabled ? `${ANSI[style]}${text}${ANSI.reset}` : text;
}

/** Strip every ANSI escape. Used by tests and by `--json`. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex -- matching escapes is the point
  return text.replace(/\u001B\[[0-9;]*m/g, "");
}

export type Writer = {
  /** Data. Machines read this. */
  out(text: string): void;
  /** Diagnostics, progress, warnings. Humans read this. */
  err(text: string): void;
};

export function processWriter(): Writer {
  return {
    out(text) {
      process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
    },
    err(text) {
      process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
    },
  };
}

/** Collects output instead of writing it, so tests can assert on both streams. */
export function bufferWriter(): Writer & {
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
  };
}

export function renderJson(envelope: JsonEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

/**
 * `key: value` lines, aligned. The workhorse of the human renderer.
 *
 * Long values wrap under a hanging indent so they stay in their column rather
 * than running back to the left margin. A value with no spaces — a path, a
 * URL — is left intact even when it overflows, because breaking one makes it
 * uncopyable, which is worse than a wrapped line.
 */
export function renderFields(
  fields: readonly (readonly [string, string])[],
  color: boolean,
  width = Number.POSITIVE_INFINITY,
): string {
  const labelWidth = Math.max(0, ...fields.map(([label]) => label.length));
  const gutter = " ".repeat(labelWidth + 2);

  return fields
    .flatMap(([label, value]) => {
      const [first = "", ...rest] = wrapValue(value, width - labelWidth - 2);
      return [
        `${paint(label.padEnd(labelWidth), "dim", color)}  ${first}`,
        ...rest.map((line) => `${gutter}${line}`),
      ];
    })
    .join("\n");
}

function wrapValue(value: string, limit: number): string[] {
  if (!Number.isFinite(limit) || value.length <= limit) return [value];

  const lines: string[] = [];
  let current = "";
  for (const word of value.split(" ")) {
    if (current === "") current = word;
    else if (current.length + 1 + word.length <= limit) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

export function renderHeading(text: string, color: boolean): string {
  return paint(text, "bold", color);
}

/** Errors always read the same way, whichever command produced them. */
export function renderError(error: PrismError, color: boolean): string {
  const code = paint(error.code, "red", color);
  return `${code}: ${error.message}`;
}
