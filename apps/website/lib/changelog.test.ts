import { describe, expect, it } from "vitest";
import {
  feedReleases,
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

  it("tags Prepare / Guard as Intelligence", () => {
    const [release] = parseChangelog(`# Changelog

## 1.12.0 — Agent-native

### Intelligence

- prepare_change packs.

### MCP

- prepare_change and guard_session.
`);
    expect(releaseTags(release!)).toEqual(["Intelligence", "MCP"]);
    expect(releaseChips(release!)).toEqual(["Intelligence", "MCP"]);
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

  it("joins a wrapped bullet and keeps section prose", () => {
    const [release] = parseChangelog(`# Changelog

## 1.0.5

- **Extension:** walkthrough
  parity and the delete intent.

## 1.0.0

### What you can do with it

See the repository. A map at four zoom levels.

Then judge the codebase.

- **VS Code** — the full UI.
`);
    expect(release?.version).toBe("1.0.5");
    expect(release?.bullets).toEqual([
      "**Extension:** walkthrough parity and the delete intent.",
    ]);
    const stable = parseChangelog(`# Changelog

## 1.0.0

### What you can do with it

See the repository. A map at four zoom levels.

Then judge the codebase.

- **VS Code** — the full UI.
`)[0];
    expect(stable?.sections[0]?.intro).toBe(
      "See the repository. A map at four zoom levels.\n\nThen judge the codebase.",
    );
    expect(stable?.sections[0]?.bullets).toEqual([
      "**VS Code** — the full UI.",
    ]);
  });
});

describe("feedReleases", () => {
  it("puts 2.0.0 first when the file has no 2.0.0 heading", () => {
    const releases = feedReleases(`# Changelog

## 1.12.0 — Agent-native

- Prepare
`);
    expect(releases[0]?.version).toBe("2.0.0");
    expect(releases[1]?.version).toBe("1.12.0");
    expect(releases[0]?.bullets).toEqual([
      "Clarity, reliability and precision.",
    ]);
  });

  it("does not duplicate a 2.0.0 heading", () => {
    const releases = feedReleases(`# Changelog

## 2.0.0 — Clarity

- Receipts

## 1.12.0

- Prepare
`);
    expect(releases.map((r) => r.version)).toEqual(["2.0.0", "1.12.0"]);
    expect(releases[0]?.bullets).toEqual(["Receipts"]);
  });
});
