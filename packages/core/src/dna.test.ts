import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  DeveloperPersona,
  DnaReportSchema,
  StackDomain,
} from "@repo-prism/shared";
import { Prism } from "./prism.js";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
);

describe("workspace getDna (M-013)", () => {
  it("returns enriched DNA for the multi-domain monorepo fixture", async () => {
    const client = Prism.create();
    const opened = client.openRepository(join(fixtures, "m013-mono"));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const dna = await opened.value.getDna();
    expect(dna.ok).toBe(true);
    if (!dna.ok) return;
    expect(DnaReportSchema.safeParse(dna.value).success).toBe(true);
    expect(dna.value.stack?.domains).toEqual(
      expect.arrayContaining([
        StackDomain.FRONTEND,
        StackDomain.BACKEND,
        StackDomain.DEVOPS_PLATFORM,
      ]),
    );
    expect(dna.value.stack?.personas).toContain(
      DeveloperPersona.FULLSTACK_ENGINEER,
    );
    expect(dna.value.architectureHints.length).toBeGreaterThan(0);
  });

  it("returns partial DNA for an empty workspace (no throw)", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-core-dna-empty-"));
    const client = Prism.create();
    const opened = client.openRepository(root);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const dna = await opened.value.getDna();
    expect(dna.ok).toBe(true);
    if (!dna.ok) return;
    expect(dna.value.summary).toMatch(/Partial DNA/i);
    expect(dna.value.frameworks).toEqual([]);
  });
});
