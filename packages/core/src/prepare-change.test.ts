import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Prism } from "./prism.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m070-envelope",
);

const BODY = "UNIQUE_M070_FILE_BODY_TOKEN";

describe("workspace prepareChange (M-070)", () => {
  it("packs users files, reuses lruCache, and omits file bodies", async () => {
    const opened = Prism.create().openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const indexed = await opened.value.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const result = await opened.value.prepareChange({
      task: "add caching to fetchUser",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const prep = result.value;
    expect(prep.order).toBeNull();
    expect(prep.workingSet).toBeNull();
    const paths = prep.pack.files.map((f) => f.path);
    expect(paths.some((p) => p.includes("src/users/"))).toBe(true);
    expect(JSON.stringify(prep)).not.toContain(BODY);
    expect(prep.reuse.some((r) => r.symbol === "lruCache")).toBe(true);
    expect(prep.ambiguous?.query).toBe("fetchUser");
  });

  it("returns an Express handler as canonical House Style", async () => {
    const opened = Prism.create().openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    await opened.value.index();
    const result = await opened.value.prepareChange({
      task: "add an Express route",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.conventions?.[0]?.path).toContain("routes/users");
    expect(result.value.conventions?.[0]?.whyCanonical).toMatch(
      /handlers next to the route/,
    );
  });
});
