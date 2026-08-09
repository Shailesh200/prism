import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Prism } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "..", "intelligence", "fixtures");

async function openIndexed(name: string) {
  const opened = Prism.create().openRepository(join(fixtures, name));
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error("open failed");
  const indexed = await opened.value.index();
  expect(indexed.ok).toBe(true);
  if (!indexed.ok) throw new Error("index failed");
  return opened.value;
}

describe("M-059 reference precision goldens", () => {
  it("P-A3: homonym findReferences is ambiguous without path", async () => {
    const ws = await openIndexed("m059-homonym");
    const ambiguous = ws.findReferences({ name: "shared" });
    expect(ambiguous.ok).toBe(true);
    if (!ambiguous.ok) return;
    expect(ambiguous.value.ambiguous).toBe(true);
    expect(ambiguous.value.candidates?.map((c) => c.path).sort()).toEqual([
      "format.ts",
      "math.ts",
    ]);

    const math = ws.findReferences({ name: "shared", path: "math.ts" });
    expect(
      math.ok && math.value.references.some((r) => r.path === "use-math.ts"),
    ).toBe(true);

    const blast = await ws.blastRadius({ kind: "symbol", id: "shared" });
    expect(blast.ok).toBe(true);
    if (!blast.ok) return;
    expect(blast.value.affectedFiles).toEqual([]);
    expect(blast.value.resolutionNote).toMatch(/Ambiguous/);
  });

  it("P-A4: member calls appear as via:member references", async () => {
    const ws = await openIndexed("m059-member");
    const greet = ws.findReferences({ name: "greet", path: "svc.ts" });
    expect(greet.ok).toBe(true);
    if (!greet.ok) return;
    const member = greet.value.references.filter((r) => r.via === "member");
    expect(member.length).toBeGreaterThanOrEqual(1);
    expect(member.every((r) => r.confidence === "low")).toBe(true);

    const run = ws.findReferences({ name: "run", path: "svc.ts" });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.value.references.some((r) => r.via === "member")).toBe(true);
  });

  it("P-E4: require() creates require edges", async () => {
    const ws = await openIndexed("m059-cjs");
    const deps = ws.getDependencyGraph();
    expect(deps.ok).toBe(true);
    if (!deps.ok) return;
    expect(
      deps.value.edges.some(
        (e) =>
          e.kind === "require" &&
          e.from === "file:main.js" &&
          e.to === "file:util.js",
      ),
    ).toBe(true);
  });

  it("P-E5: barrel re-export resolves call to defining module", async () => {
    const ws = await openIndexed("m049-barrel");
    const star = ws.findSymbol({ name: "star" });
    expect(star.ok).toBe(true);
    if (!star.ok) return;
    expect(star.value.some((s) => s.path.endsWith("star.ts"))).toBe(true);

    const refs = ws.findReferences({
      name: "bar",
      path: "packages/foo/src/bar.ts",
    });
    expect(refs.ok).toBe(true);
    if (!refs.ok) return;
    expect(
      refs.value.references.some((r) => r.path === "apps/web/src/app.ts"),
    ).toBe(true);
  });

  it("P-E6: tsconfig extends + baseUrl alias resolves", async () => {
    const ws = await openIndexed("m059-tsconfig");
    const deps = ws.getDependencyGraph();
    expect(deps.ok).toBe(true);
    if (!deps.ok) return;
    expect(
      deps.value.edges.some(
        (e) =>
          e.from === "file:packages/app/src/main.ts" &&
          e.to === "file:packages/lib/src/helper.ts",
      ),
    ).toBe(true);
  });

  it("P-E7: .d.ts import edges are typeOnly in blast lane", async () => {
    const ws = await openIndexed("m059-dts");
    const deps = ws.getDependencyGraph();
    expect(deps.ok).toBe(true);
    if (!deps.ok) return;
    const edge = deps.value.edges.find(
      (e) => e.from === "file:ambient.d.ts" && e.to === "file:runtime.ts",
    );
    expect(edge?.attrs?.["typeOnly"]).toBe(true);

    const blast = await ws.blastRadius({ kind: "file", id: "runtime.ts" });
    expect(blast.ok).toBe(true);
    if (!blast.ok) return;
    const ambient = blast.value.affectedFiles.find(
      (f) => f.path === "ambient.d.ts",
    );
    expect(ambient?.lane ?? ambient?.category).toBe("type");
  });
});
