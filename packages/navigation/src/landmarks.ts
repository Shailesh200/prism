import type { FeatureInfo, IndexSnapshot, Landmark } from "@repo-prism/shared";

const ENTRY_RE =
  /(^|\/)(main|index|app|page|server|cli)\.(ts|tsx|js|jsx|mjs|cjs)$/i;

function landmark(
  id: string,
  label: string,
  path: string,
  kind: Landmark["kind"],
  note?: string,
): Landmark {
  return {
    id,
    label,
    path,
    kind,
    ...(note === undefined ? {} : { note }),
  };
}

/**
 * Resolve named landmarks from an index snapshot (+ optional features).
 */
export function listLandmarks(
  snapshot: IndexSnapshot,
  features: readonly FeatureInfo[] = [],
): Landmark[] {
  const out: Landmark[] = [];
  const seen = new Set<string>();

  const add = (item: Landmark) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  };

  for (const file of snapshot.files) {
    const base = file.path.split("/").pop() ?? file.path;
    if (ENTRY_RE.test(file.path)) {
      add(
        landmark(
          `landmark:entry:${file.path}`,
          base,
          file.path,
          "entrypoint",
          "Entry-like filename",
        ),
      );
    }
    if (file.path.endsWith("package.json")) {
      const dir =
        file.path === "package.json"
          ? "."
          : file.path.slice(0, -"/package.json".length);
      add(
        landmark(
          `landmark:pkg:${file.path}`,
          dir === "." ? "workspace root" : dir,
          file.path,
          "package-root",
          "Package manifest",
        ),
      );
    }
    if (
      /(^|\/)(tsconfig.*\.json|Dockerfile|turbo\.json|next\.config\..+)$/i.test(
        file.path,
      )
    ) {
      add(
        landmark(
          `landmark:config:${file.path}`,
          base,
          file.path,
          "config",
          "Config / tooling marker",
        ),
      );
    }
  }

  for (const feature of features) {
    const root = feature.memberFiles[0];
    if (!root) continue;
    add(
      landmark(
        `landmark:feature:${feature.id}`,
        feature.name,
        root,
        "feature",
        `Feature ${feature.slug}`,
      ),
    );
  }

  return out.sort((a, b) => a.id.localeCompare(b.id));
}
