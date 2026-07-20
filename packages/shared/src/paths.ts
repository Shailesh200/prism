import { PrismErrorCode, prismError } from "./errors.js";
import { err, ok, type Result } from "./result.js";

/**
 * Workspace-relative POSIX path used in all public contracts.
 * - forward slashes only
 * - no leading `/`
 * - no `..` segments
 * - `.` and empty → `""` (repo root)
 */
export type RepoRelativePath = string & {
  readonly __brand: "RepoRelativePath";
};

export function normalizeRepoPath(
  input: string,
): Result<RepoRelativePath, ReturnType<typeof prismError>> {
  if (input.includes("\0")) {
    return err(prismError(PrismErrorCode.INVALID_PATH, "Path contains NUL"));
  }

  let p = input.replace(/\\/g, "/").trim();

  // Strip drive prefixes like C:/
  p = p.replace(/^[A-Za-z]:\//, "");

  // Absolute POSIX → reject (contracts are workspace-relative)
  if (p.startsWith("/")) {
    return err(
      prismError(
        PrismErrorCode.INVALID_PATH,
        "Absolute paths are not allowed in contracts",
      ),
    );
  }

  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      return err(
        prismError(
          PrismErrorCode.INVALID_PATH,
          "Parent segments (..) are not allowed",
        ),
      );
    }
    parts.push(seg);
  }

  return ok(parts.join("/") as RepoRelativePath);
}

export function joinRepoPath(
  base: RepoRelativePath | string,
  ...segments: string[]
): Result<RepoRelativePath, ReturnType<typeof prismError>> {
  const joined = [base, ...segments].filter((s) => s.length > 0).join("/");
  return normalizeRepoPath(joined);
}

export function isRepoRelativePath(value: unknown): value is RepoRelativePath {
  if (typeof value !== "string") return false;
  return normalizeRepoPath(value).ok;
}
