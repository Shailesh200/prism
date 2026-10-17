/**
 * The package root is imported by the website's client components, so
 * nothing reachable from `src/index.ts` may import a `node:` module. Node-only
 * modules live behind subpath exports (`./session-store`, `./feedback-store`,
 * `./session-dedupe`, `./events`, ...).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = dirname(fileURLToPath(import.meta.url));
const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/g;

function reachable(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const walk = (file: string): void => {
    if (seen.has(file)) return;
    const text = readFileSync(file, "utf8");
    const specs = [...text.matchAll(IMPORT)].map((m) => m[1]!);
    seen.set(file, specs);
    for (const spec of specs) {
      if (!spec.startsWith(".")) continue;
      walk(resolve(dirname(file), spec.replace(/\.js$/, ".ts")));
    }
  };
  walk(entry);
  return seen;
}

describe("shared root export", () => {
  it("never reaches a node: import", () => {
    const offenders = [...reachable(join(src, "index.ts"))]
      .filter(([, specs]) => specs.some((s) => s.startsWith("node:")))
      .map(([file]) => file.slice(src.length + 1));
    expect(offenders).toEqual([]);
  });
});
