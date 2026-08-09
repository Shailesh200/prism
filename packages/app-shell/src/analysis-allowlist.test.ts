/**
 * Guard: app-shell must not grow new analysis reimplementations.
 * Presentational helpers and thin re-exports are allowed; parsing /
 * scoring / aggregation belong in Core or intelligence (ADR-0004, M-053).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname);

/** Files still allowed to hold analysis-shaped code (thin wrappers / legacy). */
const ALLOWLIST = new Set([
  "domain-aggregations.ts",
  "domain-aggregations.test.ts",
  "cwv-parse.ts",
  "cwv-parse.test.ts",
  "github-ci.ts",
  "github-ci.test.ts",
  "analysis-allowlist.test.ts",
]);

/**
 * Patterns that usually mean analysis snuck back into the surface.
 * Presentational helpers (scoreColor, buildReportMarkdown) are allowed.
 */
const FORBIDDEN = [
  /JSON\.parse\([^)]*lighthouse/i,
  /function\s+build\w*(Domain|Cwv|Health|Backend|Blast)Report\s*\(/,
  /function\s+score(Health|Coupling|Modularity|Factor)\w*\s*\(/,
  /ratingFromScore\s*=/,
  /inboundDepCounts\s*=\s*function/,
  /function\s+inboundDepCounts\s*\(/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

describe("app-shell analysis allowlist", () => {
  it("forbids new analysis patterns outside the allowlist", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const base = file.slice(SRC.length + 1).replace(/\\/g, "/");
      const leaf = base.split("/").pop() ?? base;
      if (ALLOWLIST.has(leaf) || ALLOWLIST.has(base)) continue;
      const text = readFileSync(file, "utf8");
      for (const re of FORBIDDEN) {
        if (re.test(text)) {
          offenders.push(`${base} matches ${re}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
