import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEXT_VARIANTS } from "./Text.js";

const css = readFileSync(
  fileURLToPath(new URL("./primitives.css", import.meta.url)),
  "utf8",
);

describe("Text variants", () => {
  it("covers the product type roles", () => {
    expect(TEXT_VARIANTS).toEqual([
      "title",
      "page",
      "headline",
      "heading",
      "subheading",
      "card",
      "section",
      "lede",
      "body",
      "caption",
      "label",
      "eyebrow",
      "code",
      "metric",
    ]);
  });

  it("styles every variant from the shared tokens", () => {
    for (const variant of TEXT_VARIANTS) {
      expect(css).toContain(`.prism-type.prism-type--${variant}`);
    }
    expect(css).toContain("font-family: var(--prism-font)");
    expect(css).toContain("font-family: var(--prism-mono)");
    expect(css).toContain("color: var(--prism-ink-heading, #ffffff)");
    expect(css).toContain("color: var(--prism-ink-muted)");
  });
});
