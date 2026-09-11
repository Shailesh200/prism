import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("wake Stitch art", () => {
  it("keeps the cartographic labels from the Wake screen", () => {
    const src = readFileSync(join(here, "wake-art.tsx"), "utf8");
    expect(src).toContain("RADIAL: 124μm");
    expect(src).toContain("INDEX : 0x7E2");
    expect(src).toContain("BLAST: 14 NODES");
    expect(src).toContain("MAP : STABLE");
    expect(src).not.toContain("preserveAspectRatio");
  });
});
