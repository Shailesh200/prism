import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Vite aliases `@repo-prism/app-shell/styles.css` at this file. The package
 * build concatenates the same extras into dist/styles.css. If one list
 * drifts, the playground Jobs board (and any other extra) ships unstyled.
 */
describe("styles.css", () => {
  it("imports every extra the CSS build concatenates", () => {
    const pkg = readFileSync(join(here, "../package.json"), "utf8");
    const match = pkg.match(/const parts=\[([^\]]+)\]/);
    expect(match).toBeTruthy();
    const parts = [...(match?.[1] ?? "").matchAll(/'([^']+\.css)'/g)].map(
      (row) => row[1],
    );
    expect(parts).toContain("jobs-extra.css");
    expect(parts).toContain("hub-scoped.css");
    expect(parts).not.toContain("hub-screens.css");

    const source = readFileSync(join(here, "styles.css"), "utf8");
    for (const part of parts) {
      expect(source, `src/styles.css missing ${part}`).toContain(`./${part}`);
    }
  });
});
