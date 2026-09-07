import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Badge tones stay distinct", () => {
  it("does not let map.css paint every .prism-badge the same colour", () => {
    const map = readFileSync(join(here, "map.css"), "utf8");
    expect(map).not.toMatch(/\.prism-badge\s*\{[^}]*\bcolor\s*:/);
  });

  it("gives Failed and Done different tone rules of equal weight", () => {
    const primitives = readFileSync(join(here, "primitives.css"), "utf8");
    expect(primitives).toMatch(/\.prism-badge\.prism-badge--rose\b/);
    expect(primitives).toMatch(/\.prism-badge\.prism-badge--emerald\b/);
    expect(primitives).toMatch(/\.prism-badge\.prism-badge--pulse\b/);
  });

  it("keeps long labels on one line with padding intact", () => {
    const primitives = readFileSync(join(here, "primitives.css"), "utf8");
    const block = primitives.match(/\.prism-badge \{[^}]+\}/)?.[0] ?? "";
    expect(block).toMatch(/white-space:\s*nowrap/);
    expect(block).toMatch(/width:\s*max-content/);
    expect(block).toMatch(/flex:\s*0 0 auto/);
    expect(block).not.toMatch(/max-width:\s*100%/);
  });
});

describe("design-system controls", () => {
  it("keeps radio options on one line", () => {
    const primitives = readFileSync(join(here, "primitives.css"), "utf8");
    expect(primitives).toMatch(
      /\.prism-check,\s*\.prism-radio \{[\s\S]*?flex-wrap:\s*nowrap/,
    );
    expect(primitives).toMatch(
      /\.prism-radios__row \{[\s\S]*?flex-wrap:\s*nowrap/,
    );
  });

  it("aligns radio legends with other field labels", () => {
    const primitives = readFileSync(join(here, "primitives.css"), "utf8");
    expect(primitives).toMatch(
      /fieldset\.prism-field,\s*\.prism-radios \{[\s\S]*?border:\s*0/,
    );
    expect(primitives).toMatch(
      /\.prism-radios > legend \{[\s\S]*?padding:\s*0/,
    );
  });

  it("styles Select as a listbox, not a native OS menu", () => {
    const primitives = readFileSync(join(here, "primitives.css"), "utf8");
    expect(primitives).toMatch(/\.prism-select__list\b/);
    expect(primitives).toMatch(/\.prism-select__option--on\b/);
  });

  it("keeps Select labels on one line with ellipsis", () => {
    const primitives = readFileSync(join(here, "primitives.css"), "utf8");
    const value =
      primitives.match(/\.prism-select__value \{[^}]+\}/)?.[0] ?? "";
    const option =
      primitives.match(/\.prism-select__option > span \{[^}]+\}/)?.[0] ?? "";
    expect(value).toMatch(/text-overflow:\s*ellipsis/);
    expect(value).toMatch(/white-space:\s*nowrap/);
    expect(option).toMatch(/text-overflow:\s*ellipsis/);
    expect(option).toMatch(/white-space:\s*nowrap/);
  });

  it("gives SearchableInput a single chrome border", () => {
    const primitives = readFileSync(join(here, "primitives.css"), "utf8");
    const search = primitives.match(/\.prism-search \{[^}]+\}/)?.[0] ?? "";
    const input =
      primitives.match(/\.prism-search__input \{[^}]+\}/)?.[0] ?? "";
    expect(search).toMatch(/border:\s*1px solid/);
    expect(search).not.toMatch(/padding:\s*3px/);
    expect(input).toMatch(/border:\s*0/);
    expect(input).toMatch(/appearance:\s*none/);
    expect(primitives).not.toMatch(/\.prism-search__well\b/);
  });

  it("keeps warning and danger as outline so intent is a colour, not a fill", () => {
    const primitives = readFileSync(join(here, "primitives.css"), "utf8");
    expect(primitives).toMatch(
      /\.prism-btn--warning(?:,\s*\.prism-btn--warn)? \{[^}]*background: transparent;/s,
    );
    expect(primitives).toMatch(
      /\.prism-btn--warning(?:,\s*\.prism-btn--warn)? \{[^}]*border-color: var\(--prism-amber\);/s,
    );
    expect(primitives).toMatch(
      /\.prism-btn--danger(?:,\s*\.prism-btn--error)? \{[^}]*background: transparent;/s,
    );
    expect(primitives).toMatch(
      /\.prism-btn--danger(?:,\s*\.prism-btn--error)? \{[^}]*border-color: var\(--prism-rose\);/s,
    );
  });
});
