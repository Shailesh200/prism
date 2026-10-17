import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseChangelog } from "./changelog";
import { LEGACY_TAGS, legacyTag } from "./changelog-legacy";

const markdown = readFileSync(
  path.join(__dirname, "../../../CHANGELOG.md"),
  "utf8",
);
const releases = parseChangelog(markdown);

function bulletCount(version: string): number {
  const r = releases.find((x) => x.version === version);
  if (!r) return -1;
  return r.sections.length > 0
    ? r.sections.reduce((n, s) => n + s.bullets.length, 0)
    : r.bullets.length;
}

describe("1.x legacy tags", () => {
  it("has one letter per bullet for every tagged release", () => {
    for (const [version, letters] of Object.entries(LEGACY_TAGS)) {
      expect(version.startsWith("1."), version).toBe(true);
      expect(letters, version).toMatch(/^[rc-]+$/);
      expect(letters.length, version).toBe(bulletCount(version));
    }
  });

  it("reads the letters", () => {
    expect(legacyTag("1.1.16", 0)).toBe("removed");
    expect(legacyTag("1.12.0", 0)).toBe("changed");
    expect(legacyTag("1.12.0", 2)).toBeUndefined();
    expect(legacyTag("9.9.9", 0)).toBeUndefined();
  });
});
