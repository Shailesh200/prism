import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ApplyRenameInput,
  ApplyRenameResult,
} from "@repo-prism/app-shell/apply-rename";

/** Local copy of app-shell's rewrite so this package can publish without it. */
function rewritePathReferences(
  content: string,
  fromPath: string,
  toPath: string,
): { readonly next: string; readonly replacements: number } {
  const from = fromPath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
  const to = toPath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
  if (!from || from === to) return { next: content, replacements: 0 };

  const stripExt = (path: string): string => path.replace(/\.[^./]+$/, "");
  const basename = (path: string): string => {
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(i + 1) : path;
  };
  const escapeRegExp = (s: string): string =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const fromStem = stripExt(from);
  const toStem = stripExt(to);
  const fromBase = basename(from);
  const toBase = basename(to);
  const fromBaseStem = stripExt(fromBase);
  const toBaseStem = stripExt(toBase);

  let next = content;
  let replacements = 0;
  const replaceAll = (haystack: string, old: string, neu: string): string => {
    if (!old || old === neu || !haystack.includes(old)) return haystack;
    const parts = haystack.split(old);
    replacements += parts.length - 1;
    return parts.join(neu);
  };

  next = replaceAll(next, from, to);
  if (fromStem !== from && toStem !== to) {
    next = replaceAll(next, fromStem, toStem);
  }
  if (fromBase && fromBase !== toBase) {
    const baseRe = new RegExp(
      `(?<=[/'"\`])${escapeRegExp(fromBase)}(?=['"\`?]|$)`,
      "g",
    );
    next = next.replace(baseRe, () => {
      replacements += 1;
      return toBase;
    });
  }
  if (
    fromBaseStem &&
    fromBaseStem !== toBaseStem &&
    fromBaseStem !== fromBase &&
    fromBaseStem.length >= 2
  ) {
    const stemRe = new RegExp(
      `(?<=[/'"\`])${escapeRegExp(fromBaseStem)}(?=['"\`])`,
      "g",
    );
    next = next.replace(stemRe, () => {
      replacements += 1;
      return toBaseStem;
    });
  }
  return { next, replacements };
}

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
