import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PACKAGE_NAME, PrismSession } from "./index.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

describe("@prism/vscode-extension", () => {
  it("exports package name", () => {
    expect(PACKAGE_NAME).toBe("@prism/vscode-extension");
  });

  it("indexes a fixture and returns a repository map", async () => {
    const session = new PrismSession();
    const opened = await session.open(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const map = session.getMap("package");
    expect(map.ok).toBe(true);
    if (!map.ok) return;
    expect(map.value.map.graph.nodes.length).toBeGreaterThan(0);

    const reindexed = await session.reindex();
    expect(reindexed.ok).toBe(true);

    session.close();
    expect(session.isOpen).toBe(false);
  });
});
