import { describe, expect, it } from "vitest";
import {
  parseChangelog,
  releaseChips,
  releaseDek,
  releaseTags,
} from "./changelog";

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

  it("tags MCP/CLI/IDE subsections for the magazine archive", () => {
    const [release] = parseChangelog(`# Changelog

## 1.1.17 — Shippable product

### MCP

- Queue a teammate from chat.

### CLI

- One install page.

### IDE

- Open the Console from the sidebar.
`);
    expect(releaseTags(release!)).toEqual(["Dispatch", "CLI", "MCP"]);
    expect(releaseChips(release!)).toEqual(["MCP", "CLI", "IDE"]);
    expect(releaseDek(release!)).toBe("Queue a teammate from chat.");
  });

  it("does not treat Cursor/MCP boilerplate as an MCP chip", () => {
    const [release] = parseChangelog(`# Changelog

## 1.1.16

- **Dispatch:** optional flags dropped on retry.
- Keep \`@latest\`; hop on the next Cursor/MCP start.
`);
    expect(releaseTags(release!)).toEqual(["Dispatch"]);
    expect(releaseChips(release!)).toEqual(["Dispatch"]);
  });
});
