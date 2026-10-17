import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_TOOL_NAMES } from "./tool-names.js";
import { PRISM_RULESET, PRISM_RULESET_MAX_TOKENS } from "./ruleset.js";
import { estimateTokens } from "./tokens.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("Prism ruleset (plan P16)", () => {
  it("RULE-1 stays within its token cap", () => {
    expect(estimateTokens(PRISM_RULESET)).toBeLessThanOrEqual(
      PRISM_RULESET_MAX_TOKENS,
    );
  });

  it("the hook's prism-rules.md is a byte-identical copy", () => {
    const copy = readFileSync(
      join(here, "..", "..", "plugin", "hooks", "prism-rules.md"),
      "utf8",
    );
    expect(copy).toBe(`${PRISM_RULESET}\n`);
  });

  it("CACHE-2 names only default tools and holds nothing volatile", () => {
    const named = [...PRISM_RULESET.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)].map(
      (m) => m[0],
    );
    const visible = new Set<string>(DEFAULT_TOOL_NAMES);
    expect(named.filter((name) => !visible.has(name))).toEqual([]);
    expect(PRISM_RULESET).not.toMatch(/\d{4}-\d{2}-\d{2}|[0-9a-f]{12,}/);
  });
});
