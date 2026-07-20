import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverPackageRoots } from "./package-roots.js";

describe("discoverPackageRoots", () => {
  it("finds nested package.json and go.mod roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-pkg-roots-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "workspace", private: true }),
    );
    await mkdir(join(root, "apps", "web"), { recursive: true });
    await writeFile(
      join(root, "apps", "web", "package.json"),
      JSON.stringify({ name: "@demo/web" }),
    );
    await mkdir(join(root, "services", "api"), { recursive: true });
    await writeFile(
      join(root, "services", "api", "go.mod"),
      "module github.com/demo/api\n\ngo 1.22\n",
    );
    await mkdir(join(root, "node_modules", "left-pad"), { recursive: true });
    await writeFile(
      join(root, "node_modules", "left-pad", "package.json"),
      JSON.stringify({ name: "left-pad" }),
    );

    const roots = discoverPackageRoots(root);
    expect(roots.map((r) => r.rootDir)).toEqual([
      "",
      "apps/web",
      "services/api",
    ]);
    expect(roots.find((r) => r.rootDir === "apps/web")?.id).toBe("@demo/web");
    expect(roots.find((r) => r.rootDir === "services/api")?.name).toBe(
      "github.com/demo/api",
    );
  });
});
