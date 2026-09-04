import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  rewritePathReferences,
  type ApplyRenameInput,
  type ApplyRenameResult,
} from "@repo-prism/app-shell/apply-rename";

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function absPath(root: string, repoRelative: string): string {
  return join(root, normalize(repoRelative));
}

async function pathExists(abs: string): Promise<boolean> {
  try {
    await stat(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Node `fs` rename plus best-effort import/path rewrites.
 *
 * The default for any host without an editor behind it — the Console and the
 * playground. The VS Code extension overrides this with a workspace-edit
 * version so the change lands in the editor's undo stack.
 */
export async function applyRenameOnDisk(
  root: string,
  input: ApplyRenameInput,
): Promise<ApplyRenameResult> {
  const fromPath = normalize(input.fromPath);
  const toPath = normalize(input.toPath);
  if (!fromPath || !toPath) {
    return { ok: false, error: "fromPath and toPath are required" };
  }
  if (fromPath === toPath) {
    return { ok: false, error: "Destination path matches the origin" };
  }

  const fromAbs = absPath(root, fromPath);
  const toAbs = absPath(root, toPath);

  if (!(await pathExists(fromAbs))) {
    return { ok: false, error: `Source file not found: ${fromPath}` };
  }
  if (await pathExists(toAbs)) {
    return { ok: false, error: `Destination already exists: ${toPath}` };
  }

  const editedFiles: string[] = [];

  for (const site of input.editSites) {
    const sitePath = normalize(site.path);
    if (!sitePath || sitePath === fromPath) continue;
    const siteAbs = absPath(root, sitePath);
    let text: string;
    try {
      text = await readFile(siteAbs, "utf8");
    } catch {
      continue;
    }
    const { next, replacements } = rewritePathReferences(
      text,
      fromPath,
      toPath,
    );
    if (replacements === 0 || next === text) continue;
    await writeFile(siteAbs, next, "utf8");
    editedFiles.push(sitePath);
  }

  const toDir = dirname(toAbs);
  await mkdir(toDir, { recursive: true });

  try {
    await rename(fromAbs, toAbs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Rename failed after editing ${editedFiles.length} file(s): ${message}`,
    };
  }

  return { ok: true, fromPath, toPath, editedFiles };
}
