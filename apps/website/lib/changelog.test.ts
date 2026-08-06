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
});
