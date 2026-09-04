import { describe, expect, it } from "vitest";
import { parseChangelog } from "./changelog";

describe("parseChangelog", () => {
  it("parses semver sections and bullets", () => {
    const releases = parseChangelog(`# Changelog

## 1.0.5

- **MCP:** progress
- **CLI:** help

## 1.0.4

- Docs
`);
    expect(releases).toHaveLength(2);
    expect(releases[0]?.version).toBe("1.0.5");
    expect(releases[0]?.bullets).toHaveLength(2);
    expect(releases[1]?.version).toBe("1.0.4");
  });

  it("parses titled headings and IDE/CLI/MCP subsections", () => {
    const releases = parseChangelog(`# Changelog

## 1.1.17 — Shippable product

### MCP

- Queue a teammate from chat.

### CLI

- One install page.

### IDE

- Open the Console from the sidebar.
`);
    expect(releases).toHaveLength(1);
    expect(releases[0]?.version).toBe("1.1.17");
    expect(releases[0]?.title).toBe("Shippable product");
    expect(releases[0]?.sections.map((s) => s.title)).toEqual([
      "MCP",
      "CLI",
      "IDE",
    ]);
    expect(releases[0]?.sections[0]?.bullets).toEqual([
      "Queue a teammate from chat.",
    ]);
    expect(releases[0]?.bullets).toHaveLength(3);
  });
});
