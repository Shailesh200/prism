/**
 * Path inputs from agents (M-027).
 *
 * Prism reads a workspace and nothing else. An agent that has confused its
 * working directory — or has been talked into it by a prompt injection in a
 * source file — must not be able to point Prism at `/etc` or at a sibling
 * checkout. Every path argument goes through here first.
 */

import { isAbsolute, relative, resolve } from "node:path";
import {
  PrismErrorCode,
  type PrismError,
  type Result,
  err,
  ok,
  prismError,
} from "@repo-prism/shared";

/**
 * Normalise a path argument to a workspace-relative path.
 *
 * Absolute paths are accepted only when they land inside the workspace, because
 * an agent reading a stack trace has a legitimate reason to hold one. Anything
 * that escapes the root — via `..`, or by being absolute elsewhere — is
 * rejected with the path echoed back so the failure is diagnosable.
 */
export function toWorkspaceRelative(
  workspaceRoot: string,
  input: string,
): Result<string, PrismError> {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return err(prismError(PrismErrorCode.INVALID_PATH, "Path is empty"));
  }

  const absolute = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(workspaceRoot, trimmed);
  const rel = relative(resolve(workspaceRoot), absolute);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    return err(
      prismError(
        PrismErrorCode.INVALID_PATH,
        `Path is outside the workspace: ${trimmed}`,
        { workspaceRoot, resolved: absolute },
      ),
    );
  }

  // `relative()` returns "" when the path *is* the root; "." is the honest
  // relative spelling of that.
  return ok(rel === "" ? "." : rel);
}

/** Same rule, applied to a list. The first bad path fails the whole call. */
export function allWorkspaceRelative(
  workspaceRoot: string,
  inputs: readonly string[],
): Result<string[], PrismError> {
  const out: string[] = [];
  for (const input of inputs) {
    const resolved = toWorkspaceRelative(workspaceRoot, input);
    if (!resolved.ok) return resolved;
    out.push(resolved.value);
  }
  return ok(out);
}
