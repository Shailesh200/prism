import { createFixture } from "@repo-prism/test-support";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Prism } from "./prism.js";
import { buildAgentsMdContent, parseAgentsMdClaims } from "./agents-md.js";

describe("buildAgentsMdContent / parseAgentsMdClaims (pure)", () => {
  it("round-trips the claims block", () => {
    const content = buildAgentsMdContent({
      generatedAt: "2026-01-01T00:00:00.000Z",
      cycles: [["a.ts", "b.ts"]],
      testFiles: ["src/cart.test.ts"],
    });
    expect(content).toContain("Cycle: a.ts → b.ts");
    expect(content).toContain("src/cart.test.ts");
    expect(content).not.toContain("## Features");

    const claims = parseAgentsMdClaims(content);
    expect(claims).toEqual({
      generatedAt: "2026-01-01T00:00:00.000Z",
      cycles: [["a.ts", "b.ts"]],
    });
  });

  it("returns null when there is no claims block", () => {
    expect(parseAgentsMdClaims("# just prose\n")).toBeNull();
  });
});

describe("workspace generateAgentsMd / checkAgentsMd (M-073 Living AGENTS.md)", () => {
  let prismHome: string;
  let originalPrismHome: string | undefined;

  beforeEach(async () => {
    prismHome = await mkdtemp(join(tmpdir(), "prism-home-"));
    originalPrismHome = process.env.PRISM_HOME;
    process.env.PRISM_HOME = prismHome;
  });

  afterEach(async () => {
    if (originalPrismHome === undefined) delete process.env.PRISM_HOME;
    else process.env.PRISM_HOME = originalPrismHome;
    await rm(prismHome, { recursive: true, force: true });
  });

  it("writes AGENTS.md only under PRISM_HOME, never into the repo", async () => {
    const fixture = await createFixture({ name: "m073-agents-md" });
    try {
      await fixture.write(
        "src/a.ts",
        'import { b } from "./b.js";\nexport function a(): number { return b(); }\n',
      );
      await fixture.write(
        "src/b.ts",
        'import { a } from "./a.js";\nexport function b(): number { return 1; }\n',
      );
      await fixture.write("src/a.test.ts", "export {};\n");
      fixture.commit("initial");

      const opened = Prism.create().openRepository(fixture.root);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const workspace = opened.value;
      const indexed = await workspace.index();
      expect(indexed.ok).toBe(true);
      if (!indexed.ok) return;

      const generated = await workspace.generateAgentsMd();
      expect(generated.ok).toBe(true);
      if (!generated.ok) return;
      expect(generated.value.path.startsWith(prismHome)).toBe(true);
      expect(generated.value.content).toContain("AGENTS.md");

      // Indexing may leave its own untracked `.prism/` cache — that is a
      // pre-existing, unrelated Core concern. What this feature must never
      // do is add an AGENTS.md (or any file) of its own to the repo tree.
      const status = fixture.git("status", "--porcelain");
      expect(status).not.toMatch(/AGENTS\.md/);
      await expect(access(join(fixture.root, "AGENTS.md"))).rejects.toThrow();

      const check = await workspace.checkAgentsMd();
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.value.ok).toBe(true);
      expect(check.value.issues).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("fails --check when the claims block disagrees with a fresh cycle read", async () => {
    const fixture = await createFixture({ name: "m073-agents-md-drift" });
    try {
      await fixture.write("src/lonely.ts", "export const x = 1;\n");
      fixture.commit("initial");

      const opened = Prism.create().openRepository(fixture.root);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const workspace = opened.value;
      const indexed = await workspace.index();
      expect(indexed.ok).toBe(true);
      if (!indexed.ok) return;

      const generated = await workspace.generateAgentsMd();
      expect(generated.ok).toBe(true);
      if (!generated.ok) return;

      // Invert the cycle claim by hand — the fixture has no real cycle, so a
      // regenerated check must catch this fabricated one as stale.
      const { readFile, writeFile } = await import("node:fs/promises");
      const original = await readFile(generated.value.path, "utf8");
      const tampered = original.replace(
        '"cycles":[]',
        '"cycles":[["src/lonely.ts","src/lonely.ts"]]',
      );
      expect(tampered).not.toBe(original);
      await writeFile(generated.value.path, tampered, "utf8");

      const check = await workspace.checkAgentsMd();
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.value.ok).toBe(false);
      expect(check.value.issues.some((i) => i.kind === "stale-cycle")).toBe(
        true,
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("errors when checking before anything has been generated", async () => {
    const fixture = await createFixture({ name: "m073-agents-md-missing" });
    try {
      await fixture.write("src/a.ts", "export const a = 1;\n");
      fixture.commit("initial");
      const opened = Prism.create().openRepository(fixture.root);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const workspace = opened.value;
      const indexed = await workspace.index();
      expect(indexed.ok).toBe(true);
      if (!indexed.ok) return;

      const check = await workspace.checkAgentsMd();
      expect(check.ok).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
