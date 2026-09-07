import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const files = [
  join(here, "styles.css"),
  join(here, "../../../app-shell/src/jobs-extra.css"),
];

function rawHex(css: string): string[] {
  const stripped = css.replace(
    /var\(--[a-z0-9-]+,\s*#[0-9a-fA-F]{3,8}\)/gi,
    "",
  );
  return [...stripped.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(
    (match) => match[0],
  );
}

describe("Console styles use tokens, not raw hex", () => {
  it("leaves only var() fallbacks in styles.css and jobs-extra.css", () => {
    const found = files.flatMap((path) =>
      rawHex(readFileSync(path, "utf8")).map((hex) => `${path}:${hex}`),
    );
    expect(found).toEqual([]);
  });
});
