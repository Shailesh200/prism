/**
 * Every file a package.json points at (`main`, `module`, `types`, `bin`,
 * `exports`) must exist before `npm publish` packs the package.
 *
 * A `dist/` that exists is not enough: since tsbuildinfo moved into `dist/`
 * (PR 5), a build that emitted nothing still leaves `dist/tsconfig.tsbuildinfo`
 * behind, and packing that would publish a package with no code.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/** Relative file targets of one `exports` value (strings, condition objects, arrays). */
function exportTargets(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(exportTargets);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(exportTargets);
  }
  return [];
}

/** Every entry file `pkg` names, as written (e.g. `./dist/index.js`). */
export function entryTargets(pkg) {
  const targets = [];
  for (const key of ["main", "module", "types"]) {
    if (typeof pkg[key] === "string") targets.push(pkg[key]);
  }
  if (typeof pkg.bin === "string") targets.push(pkg.bin);
  else if (pkg.bin && typeof pkg.bin === "object") {
    targets.push(
      ...Object.values(pkg.bin).filter((v) => typeof v === "string"),
    );
  }
  targets.push(...exportTargets(pkg.exports));
  // Subpath patterns (`./dist/*.js`) name no single file.
  return [...new Set(targets)].filter((target) => !target.includes("*"));
}

/** Entry targets of `pkg` that are missing under `dir`. Empty means publishable. */
export function missingEntryFiles(dir, pkg) {
  return entryTargets(pkg).filter((target) => !existsSync(join(dir, target)));
}
