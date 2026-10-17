import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Raw benchmark fields that must never be served: token and cost data. */
const COST_FIELDS =
  /costUsd|cost_usd|tokensIn|tokensOut|tokens_in|tokens_out|inputTokens|outputTokens|totalTokens/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const routes = walk(path.join(SITE, "app")).filter((f) =>
  /[\\/]route\.tsx?$/.test(f),
);
const publicFiles = walk(path.join(SITE, "public"));

describe("served files", () => {
  it("finds the routes and public files", () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(publicFiles.length).toBeGreaterThan(0);
  });

  it("serves no token or cost fields from a route or public file", () => {
    const hits = [...routes, ...publicFiles].filter((f) =>
      COST_FIELDS.test(readFileSync(f, "latin1")),
    );
    expect(hits.map((f) => path.relative(SITE, f))).toEqual([]);
  });

  it("has no route that reads the raw benchmark data", () => {
    const hits = routes.filter((f) =>
      /docs\/benchmarks|2\.x\.json/.test(readFileSync(f, "utf8")),
    );
    expect(hits.map((f) => path.relative(SITE, f))).toEqual([]);
  });
});
