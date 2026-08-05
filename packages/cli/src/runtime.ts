/**
 * The one place a command's result becomes bytes and an exit code (M-028).
 *
 * Commands return data and a way to describe it; they never write to a stream,
 * never call `process.exit`, and never decide their own exit code. That is what
 * keeps `--json` honest — a command physically cannot print a stray line into
 * stdout while JSON mode is on.
 */

import { stat } from "node:fs/promises";
import { Prism, type PrismWorkspace } from "@repo-prism/core";
import {
  PrismErrorCode,
  type PrismError,
  type Result,
  prismError,
} from "@repo-prism/shared";
import { ExitCode, exitCodeForError } from "./exit.js";
import {
  renderError,
  renderJson,
  type OutputOptions,
  type Writer,
} from "./output.js";
import { terminalWidth } from "./table.js";
import { resolveWorkspace, type ResolvedWorkspace } from "./workspace.js";

export type GlobalOptions = {
  readonly workspace?: string | undefined;
  readonly json: boolean;
  readonly color: boolean;
  readonly quiet: boolean;
  readonly verbose: boolean;
  /** Explicit consent for the gated paths. Never implied. */
  readonly yes: boolean;
};

/**
 * What the user typed after the command name.
 *
 * Commander has already validated arity and unknown flags by the time a
 * command sees this, so the accessors are deliberately thin — a command that
 * needs to *interpret* a value does it in the command, where the error message
 * can say what was wrong with it.
 */
export type CommandArgs = {
  readonly positionals: readonly string[];
  /** A `--flag <value>` option, or `undefined` when unset. */
  option(name: string): string | undefined;
  /** A boolean `--flag`. */
  flag(name: string): boolean;
};

export type CommandContext = {
  readonly options: GlobalOptions;
  readonly output: OutputOptions;
  readonly workspace: ResolvedWorkspace;
  readonly writer: Writer;
  readonly args: CommandArgs;
  /** Where the user is standing. Relative path arguments resolve from here. */
  readonly cwd: string;
  /** Progress and status. Suppressed under `--json` and `--quiet`. */
  progress(message: string): void;
  /** Open and index the workspace. Cached across calls within one command. */
  open(): Promise<Result<PrismWorkspace, PrismError>>;
};

/**
 * What a command produces: the DTO for `--json`, and a function that renders it
 * for a human. `findings` is how a command says "I worked, and what I found is
 * what you asked to be warned about" — the difference between exit 0 and 1.
 */
export type CommandOutcome = {
  readonly data: unknown;
  human(output: OutputOptions): string;
  readonly findings?: boolean;
};

export type CommandHandler = (
  context: CommandContext,
) => Promise<Result<CommandOutcome, PrismError>>;

export type RunOptions = {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly writer: Writer;
  readonly isTty: boolean;
  /** Terminal width when known. Tables fall back to 80 columns without it. */
  readonly columns?: number;
  readonly openWorkspace?: (root: string) => Result<PrismWorkspace, PrismError>;
};

const NO_ARGS: CommandArgs = {
  positionals: [],
  option: () => undefined,
  flag: () => false,
};

/**
 * Run one command end to end and return its exit code.
 *
 * Returns rather than exits so tests can drive it in-process, and so the top
 * level owns the single `process.exit` in the package.
 */
export async function runCommand(
  handler: CommandHandler,
  globals: GlobalOptions,
  run: RunOptions,
  args: CommandArgs = NO_ARGS,
): Promise<ExitCode> {
  const output: OutputOptions = {
    json: globals.json,
    color: globals.color,
    quiet: globals.quiet,
    width: terminalWidth(run.env, run.columns),
  };

  const workspace = resolveWorkspace({
    flag: globals.workspace,
    environment: run.env.PRISM_WORKSPACE,
    cwd: run.cwd,
  });

  let opened: PrismWorkspace | undefined;
  const context: CommandContext = {
    options: globals,
    output,
    workspace,
    writer: run.writer,
    args,
    cwd: run.cwd,
    progress(message) {
      // Progress in JSON mode would be noise at best; in a pipeline it is the
      // thing that breaks the consumer.
      if (globals.json || globals.quiet) return;
      run.writer.err(message);
    },
    async open() {
      if (opened) return { ok: true, value: opened };

      // Checked here rather than left to Core so that "you pointed me at a
      // directory that does not exist" exits 2 like the user error it is,
      // instead of 3 alongside the genuine failures.
      const usable = await assertDirectory(workspace.path);
      if (!usable.ok) return usable;

      const open = run.openWorkspace ?? defaultOpen;
      const result = open(workspace.path);
      if (!result.ok) return result;
      context.progress(`Indexing ${workspace.path} …`);
      const startedAt = Date.now();
      const indexed = await result.value.index();
      if (!indexed.ok) {
        result.value.close();
        return { ok: false, error: indexed.error };
      }
      detail(`Indexed in ${Date.now() - startedAt} ms`);
      opened = result.value;
      return { ok: true, value: opened };
    },
  };

  /** `--verbose` detail. Same suppression rules as progress. */
  function detail(message: string): void {
    if (!globals.verbose) return;
    context.progress(message);
  }

  detail(`Workspace ${workspace.path} (from ${workspace.source})`);

  try {
    const result = await handler(context);

    if (!result.ok) {
      emitError(result.error, output, run.writer);
      return exitCodeForError(result.error);
    }

    if (output.json) {
      run.writer.out(renderJson({ ok: true, data: result.value.data }));
    } else {
      run.writer.out(result.value.human(output));
    }

    return result.value.findings ? ExitCode.FINDINGS : ExitCode.OK;
  } catch (cause) {
    const error: PrismError = {
      code: "PRISM_UNKNOWN",
      message: cause instanceof Error ? cause.message : String(cause),
    };
    emitError(error, output, run.writer);
    return ExitCode.INTERNAL;
  } finally {
    opened?.close();
  }
}

/**
 * Failures go to stderr in human mode and to stdout in JSON mode: a script
 * running with `--json` should be able to read one stream and get the whole
 * story, success or failure.
 */
function emitError(
  error: PrismError,
  output: OutputOptions,
  writer: Writer,
): void {
  if (output.json) {
    writer.out(renderJson({ ok: false, error }));
    return;
  }
  writer.err(renderError(error, output.color));
}

function defaultOpen(root: string): Result<PrismWorkspace, PrismError> {
  return Prism.create().openRepository(root);
}

async function assertDirectory(
  root: string,
): Promise<Result<true, PrismError>> {
  try {
    const stats = await stat(root);
    if (stats.isDirectory()) return { ok: true, value: true };
    return {
      ok: false,
      error: prismError(
        PrismErrorCode.INVALID_PATH,
        `Workspace path is not a directory: ${root}`,
      ),
    };
  } catch {
    return {
      ok: false,
      error: prismError(
        PrismErrorCode.INVALID_PATH,
        `Workspace path does not exist: ${root}`,
      ),
    };
  }
}
