/**
 * Pure helpers for file-rename apply (M-046 r5).
 * Hosts own the FS writes; this module only computes paths + best-effort rewrites.
 */

export type ApplyRenameEditSite = {
  readonly path: string;
  readonly count?: number;
};

export type ApplyRenameInput = {
  readonly fromPath: string;
  readonly toPath: string;
  readonly editSites: readonly ApplyRenameEditSite[];
  readonly oldName?: string;
  readonly newName?: string;
};

export type ApplyRenameResult =
  | {
      readonly ok: true;
      readonly fromPath: string;
      readonly toPath: string;
      readonly editedFiles: readonly string[];
    }
  | { readonly ok: false; readonly error: string };

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function basename(path: string): string {
  const norm = normalizeRepoPath(path);
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : norm;
}

function stripExt(path: string): string {
  return path.replace(/\.[^./]+$/, "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Resolve destination path from origin + user-entered new name (basename or path). */
export function resolveRenameToPath(fromPath: string, newName: string): string {
  const from = normalizeRepoPath(fromPath);
  const name = normalizeRepoPath(newName.trim());
  if (!name) return from;
  if (name.includes("/")) return name;
  const slash = from.lastIndexOf("/");
  const dir = slash >= 0 ? from.slice(0, slash) : "";
  return dir ? `${dir}/${name}` : name;
}

/**
 * Best-effort string rewrite of import/path references from `fromPath` → `toPath`.
 * Replaces full path, extensionless stem, and basename segments — not a perfect
 * AST rename.
 */
export function rewritePathReferences(
  content: string,
  fromPath: string,
  toPath: string,
): { readonly next: string; readonly replacements: number } {
  const from = normalizeRepoPath(fromPath);
  const to = normalizeRepoPath(toPath);
  if (!from || from === to) return { next: content, replacements: 0 };

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

  // Longer / more specific first.
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
