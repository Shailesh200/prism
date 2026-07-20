import { beforeAll, describe, expect, it } from "vitest";
import { FileInventorySchema } from "@prism/shared";
import { hashBufferSha256 } from "./hash.js";
import { inventoryWorkspace } from "./inventory.js";
import { createM005Fixture } from "./test-fixture.js";

let fixtureRoot: string;

beforeAll(async () => {
  fixtureRoot = await createM005Fixture();
});

describe("inventoryWorkspace (fixture)", () => {
  it("returns a deterministic ordered inventory", async () => {
    const first = await inventoryWorkspace(fixtureRoot);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(FileInventorySchema.safeParse(first.value).success).toBe(true);

    const paths = first.value.files.map((f) => f.path);
    expect(paths).toEqual([
      ".gitignore",
      ".prismignore",
      "blob.dat",
      "nested/keep.md",
      "package.json",
      "src/a.ts",
      "src/b.ts",
      "src/bigish.txt",
    ]);

    // ignored: secret, build/*, *.tmp, node_modules
    expect(paths).not.toContain("secret.txt");
    expect(paths).not.toContain("build/out.js");
    expect(paths).not.toContain("nested/x.tmp");
    expect(paths.some((p) => p.startsWith("node_modules/"))).toBe(false);

    const binary = first.value.files.find((f) => f.path === "blob.dat");
    expect(binary?.status).toBe("skipped_binary");
    expect(binary?.contentHash).toBeNull();

    const a = first.value.files.find((f) => f.path === "src/a.ts");
    expect(a?.status).toBe("hashed");
    expect(a?.contentHash).toBe(
      hashBufferSha256(Buffer.from("export const a = 1;\n")),
    );

    const second = await inventoryWorkspace(fixtureRoot);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.files.map((f) => f.contentHash)).toEqual(
      first.value.files.map((f) => f.contentHash),
    );
    expect(second.value.files.map((f) => f.path)).toEqual(paths);
  });

  it("marks oversized files when maxFileBytes is tiny", async () => {
    const result = await inventoryWorkspace(fixtureRoot, { maxFileBytes: 10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const oversized = result.value.files.filter(
      (f) => f.status === "skipped_oversized",
    );
    expect(oversized.length).toBeGreaterThan(0);
    expect(oversized.every((f) => f.contentHash === null)).toBe(true);
  });
});
