import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ignore, { type Ignore } from "ignore";
import { BUILTIN_IGNORE_PATTERNS } from "./constants.js";

export type IgnoreEngine = {
  /** True if the POSIX workspace-relative path should be skipped. */
  ignores(repoRelativePath: string): boolean;
};

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Build a gitignore-compatible filter from builtins + `.gitignore` + `.prismignore`.
 * Nested directory `.gitignore` files are not loaded in M-005 (root-scoped).
 */
export async function createIgnoreEngine(
  workspaceRoot: string,
  options: { readonly extraPatterns?: readonly string[] } = {},
): Promise<IgnoreEngine> {
  const ig: Ignore = ignore();
  ig.add([...BUILTIN_IGNORE_PATTERNS]);

  const gitignore = await readOptional(join(workspaceRoot, ".gitignore"));
  if (gitignore !== null) ig.add(gitignore);

  const prismignore = await readOptional(join(workspaceRoot, ".prismignore"));
  if (prismignore !== null) ig.add(prismignore);

  if (options.extraPatterns?.length) {
    ig.add([...options.extraPatterns]);
  }

  return {
    ignores(repoRelativePath: string) {
      const normalized = repoRelativePath.replace(/\\/g, "/");
      if (!normalized || normalized === ".") return false;
      return ig.ignores(normalized);
    },
  };
}
