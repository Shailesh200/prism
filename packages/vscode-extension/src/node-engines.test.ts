import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

function enginesOf(rel: string): string {
  const pkg = JSON.parse(readFileSync(join(repoRoot, rel), "utf8")) as {
    engines?: { node?: string };
  };
  return pkg.engines?.node ?? "";
}

describe("Node engines widened (M-057 P-B9)", () => {
  it("published surfaces allow Node >=22", () => {
    // The repo root stays pinned by design: moon's toolchain
    // (`addEnginesConstraint`) rewrites root engines to the provisioned dev
    // Node. The P-B9 pain was the *published* packages forcing consumers onto
    // one exact runtime — those are what must stay widened.
    for (const rel of [
      "packages/core/package.json",
      "packages/cli/package.json",
      "packages/mcp-server/package.json",
    ]) {
      expect(enginesOf(rel), `${rel} engines.node`).toBe(">=22");
    }
  });

  it("CI keeps a Node version matrix on the public surfaces", () => {
    const workflow = readFileSync(
      join(repoRoot, ".github", "workflows", "verify.yml"),
      "utf8",
    );
    expect(workflow).toContain("node-matrix");
    for (const v of ['"22"', '"24"', '"26"']) {
      expect(workflow).toContain(v);
    }
  });
});
