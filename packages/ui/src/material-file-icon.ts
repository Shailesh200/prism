import {
  DEFAULT_FILE_ICON,
  DEFAULT_FOLDER_ICON,
  DEFAULT_FOLDER_OPEN_ICON,
  FILE_EXT_ICON,
  FILE_NAME_ICON,
  FOLDER_ICON,
  FOLDER_OPEN_ICON,
  MATERIAL_SVG,
} from "./material-icons.generated.js";

function baseName(nameOrPath: string): string {
  const normalized = nameOrPath.replaceAll("\\", "/");
  const base = normalized.includes("/")
    ? (normalized.split("/").pop() ?? normalized)
    : normalized;
  return base.toLowerCase();
}

/**
 * Material Icon Theme icon name for a file. Tries the full filename first
 * (e.g. `vitest.config.ts` → `vitest`), then the longest matching compound
 * extension (`d.ts`, `test.ts`), then the last extension, then a fallback.
 */
export function materialIconForFile(nameOrPath: string): string {
  const base = baseName(nameOrPath);

  const byName = FILE_NAME_ICON[base];
  if (byName) return byName;

  const segments = base.split(".");
  // Try progressively shorter compound extensions: a.b.c -> "b.c" then "c".
  for (let i = 1; i < segments.length; i += 1) {
    const ext = segments.slice(i).join(".");
    const hit = FILE_EXT_ICON[ext];
    if (hit) return hit;
  }
  return DEFAULT_FILE_ICON;
}

/** Material Icon Theme icon name for a folder (open/closed aware). */
export function materialIconForFolder(name: string, open = false): string {
  const key = baseName(name);
  const map = open ? FOLDER_OPEN_ICON : FOLDER_ICON;
  const hit = map[key];
  if (hit) return hit;
  return open ? DEFAULT_FOLDER_OPEN_ICON : DEFAULT_FOLDER_ICON;
}

/** Raw inlined SVG markup for a Material icon name (or `null` if not bundled). */
export function materialSvg(iconName: string): string | null {
  return MATERIAL_SVG[iconName] ?? null;
}
