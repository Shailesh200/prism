/**
 * Where the server looks for the repository it should analyse (M-026).
 *
 * Agents launch us with a working directory we did not choose, so the explicit
 * sources win: an argument beats the environment, and the environment beats
 * whatever cwd we happen to have inherited.
 */

import { isAbsolute, resolve } from "node:path";

/** Precedence order, most explicit first. */
export type WorkspaceSource = "argument" | "environment" | "cwd";

export type ResolvedWorkspace = {
  /** Absolute path, resolved against `cwd` when the input was relative. */
  readonly path: string;
  readonly source: WorkspaceSource;
};

export type ResolveWorkspaceInput = {
  /** `--workspace <path>` or the first positional argument. */
  readonly argument?: string | undefined;
  /** `PRISM_WORKSPACE`. */
  readonly environment?: string | undefined;
  readonly cwd: string;
};

function trimmed(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Resolve the workspace root: argument → `PRISM_WORKSPACE` → cwd.
 *
 * Relative inputs resolve against `cwd` rather than being rejected — an agent
 * passing `.` means the directory it launched us in, and refusing that would be
 * pedantry rather than safety.
 */
export function resolveWorkspacePath(
  input: ResolveWorkspaceInput,
): ResolvedWorkspace {
  const argument = trimmed(input.argument);
  if (argument !== undefined) {
    return { path: absolute(argument, input.cwd), source: "argument" };
  }

  const environment = trimmed(input.environment);
  if (environment !== undefined) {
    return { path: absolute(environment, input.cwd), source: "environment" };
  }

  return { path: absolute(input.cwd, input.cwd), source: "cwd" };
}

function absolute(path: string, cwd: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

/**
 * Read `--workspace <path>` / `--workspace=<path>`, falling back to the first
 * positional argument. Anything else is ignored rather than rejected: the
 * process is long-lived and refusing to start over an unknown flag is worse for
 * the user than starting.
 */
export function workspaceArgFrom(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--workspace" || arg === "-w") {
      return argv[i + 1];
    }
    if (arg.startsWith("--workspace=")) {
      return arg.slice("--workspace=".length);
    }
  }

  return argv.find((arg) => !arg.startsWith("-"));
}
