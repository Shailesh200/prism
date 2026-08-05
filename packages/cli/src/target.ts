/**
 * Turning what the user typed into what Core expects (M-029).
 *
 * A terminal user types the path they can see — usually relative to where they
 * are standing, which is often not the repository root, and sometimes absolute
 * because they copied it from an error message. Core takes workspace-relative
 * paths. Every command that accepts a path goes through here, so that
 * `prism blast ./src/x.ts` from a subdirectory means what it looks like.
 */

import { isAbsolute, relative, resolve } from "node:path";
import {
  PrismErrorCode,
  err,
  ok,
  prismError,
  type PrismError,
  type Result,
} from "@prism/shared";

export type ImpactTarget = {
  readonly kind: "file" | "symbol";
  readonly id: string;
  readonly path?: string;
};

/**
 * What a relative path is relative *to*.
 *
 * Standing inside the repository, `src/x.ts` means the file next to you. But
 * `prism blast src/x.ts --workspace ../other-repo` means a file in the other
 * repository — nobody types a path from their own tree and expects it to be
 * looked up in a different one. So: cwd when the cwd is inside the workspace,
 * the workspace root when it is not.
 */
function baseFor(workspaceRoot: string, cwd: string): string {
  const rel = relative(workspaceRoot, cwd);
  const inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  return inside ? cwd : workspaceRoot;
}

/**
 * Normalise a user-supplied path to workspace-relative POSIX form.
 *
 * Paths that escape the workspace are refused rather than clamped: analysing a
 * file outside the indexed tree would produce an empty report that looks like
 * "nothing depends on this", which is the most dangerous wrong answer Prism
 * can give.
 */
export function toWorkspaceRelative(
  workspaceRoot: string,
  cwd: string,
  input: string,
): Result<string, PrismError> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return err(prismError(PrismErrorCode.INVALID_PATH, "Path is empty"));
  }

  const absolute = isAbsolute(trimmed)
    ? trimmed
    : resolve(baseFor(workspaceRoot, cwd), trimmed);
  const rel = relative(workspaceRoot, absolute);

  if (rel === "") {
    return err(
      prismError(
        PrismErrorCode.INVALID_PATH,
        "Path is the workspace root; name a file or folder inside it",
      ),
    );
  }
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return err(
      prismError(
        PrismErrorCode.INVALID_PATH,
        `Path is outside the workspace: ${input}`,
      ),
    );
  }

  return ok(rel.split("\\").join("/"));
}

export function allWorkspaceRelative(
  workspaceRoot: string,
  cwd: string,
  inputs: readonly string[],
): Result<readonly string[], PrismError> {
  const out: string[] = [];
  for (const input of inputs) {
    const resolved = toWorkspaceRelative(workspaceRoot, cwd, input);
    if (!resolved.ok) return resolved;
    out.push(resolved.value);
  }
  return ok(out);
}

/**
 * Resolve an impact target.
 *
 * `--symbol` makes the argument a symbol name rather than a path. Without it
 * the argument is a path, because that is what a user standing in a repository
 * usually means, and guessing based on whether the file exists would make the
 * same command mean different things in different checkouts.
 */
export function resolveTarget(
  workspaceRoot: string,
  cwd: string,
  input: string,
  options: { readonly symbol?: boolean; readonly in?: string } = {},
): Result<ImpactTarget, PrismError> {
  if (!options.symbol) {
    const id = toWorkspaceRelative(workspaceRoot, cwd, input);
    if (!id.ok) return id;
    return ok({ kind: "file", id: id.value });
  }

  if (options.in === undefined) {
    return ok({ kind: "symbol", id: input });
  }

  const path = toWorkspaceRelative(workspaceRoot, cwd, options.in);
  if (!path.ok) return path;
  return ok({ kind: "symbol", id: input, path: path.value });
}
