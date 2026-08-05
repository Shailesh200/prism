import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Whether the workspace's `.prism` directory is excluded from git.
 *
 * `ignored: null` means undeterminable — there is no git, or the check itself
 * failed. It is deliberately distinct from `false`: a surface should say "we
 * could not tell" rather than warn about a problem it did not actually find.
 */
export type PrismGitignoreStatus = {
  readonly ignored: boolean | null;
  /** How the answer was reached, for the surface to show or log. */
  readonly detail?: string;
};

/**
 * Patterns that exclude `.prism`. Not exhaustive — it is the fallback for when
 * `git check-ignore` is unavailable, and a pattern missing from this set only
 * costs a redundant suggestion, never a wrong exclusion.
 */
const PRISM_GITIGNORE_PATTERNS = new Set([
  ".prism",
  ".prism/",
  "/.prism",
  "/.prism/",
  ".prism/**",
  "**/.prism",
]);

/**
 * Local-only. Prefers `git check-ignore`, which respects nested and global
 * ignore files, and falls back to reading the root `.gitignore`.
 */
export async function checkPrismGitignore(
  root: string | null,
): Promise<PrismGitignoreStatus> {
  if (!root) return { ignored: null };

  try {
    // The trailing slash matters. Without it git cannot tell whether `.prism`
    // is a directory when the directory does not exist yet, so the common
    // directory-only pattern `.prism/` fails to match and a correctly ignored
    // repository gets warned at exactly the moment the warning is wrong — on
    // first run, before anything has been written.
    await run("git", ["check-ignore", "-q", "--", ".prism/"], { cwd: root });
    return { ignored: true, detail: "git check-ignore" };
  } catch (error) {
    // git exits 1 for "not ignored" and something else for "could not run".
    // Conflating the two is how a repository without git ends up being told
    // its .prism folder is exposed.
    if ((error as { code?: number }).code === 1) {
      return { ignored: false, detail: "git check-ignore" };
    }
  }

  try {
    const gitignore = join(root, ".gitignore");
    if (!existsSync(gitignore)) return { ignored: false };
    const ignored = (await readFile(gitignore, "utf8"))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .some((line) => PRISM_GITIGNORE_PATTERNS.has(line));
    return { ignored, detail: ".gitignore" };
  } catch {
    return { ignored: null };
  }
}

/** Append `.prism/` to the workspace root `.gitignore` when it is missing. */
export async function addPrismToGitignore(
  root: string | null,
): Promise<PrismGitignoreStatus> {
  if (!root) return { ignored: null, detail: "no workspace" };

  const status = await checkPrismGitignore(root);
  if (status.ignored === true) return status;

  const gitignore = join(root, ".gitignore");
  let existing = "";
  try {
    if (existsSync(gitignore)) existing = await readFile(gitignore, "utf8");
  } catch {
    return { ignored: false, detail: "could not read .gitignore" };
  }

  // `check-ignore` can miss a pattern this file already contains — a global
  // ignore file being absent, say — so re-check the literal lines before
  // appending a duplicate.
  const already = existing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => PRISM_GITIGNORE_PATTERNS.has(line));
  if (already) return { ignored: true, detail: ".gitignore" };

  // Never strand the entry on the end of an unterminated last line, and label
  // it — an unexplained `.prism/` in someone's diff invites deletion.
  const separator =
    existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
  const spacer = existing.length > 0 ? "\n" : "";
  try {
    await appendFile(
      gitignore,
      `${separator}${spacer}# Prism local cache\n.prism/\n`,
      "utf8",
    );
  } catch {
    return { ignored: false, detail: "could not write .gitignore" };
  }
  return checkPrismGitignore(root);
}
