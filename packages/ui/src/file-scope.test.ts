import { describe, expect, it } from "vitest";
import {
  cardEntriesAt,
  drillScopeFromMapNode,
  folderCardEntries,
  parentFolderPath,
  scopeGraphNodes,
} from "./file-scope.js";

describe("file-scope", () => {
  const files = [
    {
      id: "file:src/a.ts",
      kind: "file",
      label: "src/a.ts",
      attrs: { path: "src/a.ts" },
    },
    {
      id: "file:src/lib/b.ts",
      kind: "file",
      label: "src/lib/b.ts",
      attrs: { path: "src/lib/b.ts" },
    },
    {
      id: "file:pkg/c.ts",
      kind: "file",
      label: "pkg/c.ts",
      attrs: { path: "pkg/c.ts" },
    },
  ];

  it("builds top-level folder cards", () => {
    const cards = folderCardEntries(files);
    expect(cards.map((c) => c.name).sort()).toEqual(["pkg", "src"]);
  });

  it("opens a folder into child file/folder cards", () => {
    const cards = cardEntriesAt(files, "src");
    expect(cards.map((c) => c.name).sort()).toEqual(["a.ts", "lib"]);
  });

  it("scopes explorer nodes under a folder", () => {
    const scoped = scopeGraphNodes(files, {
      title: "src",
      kind: "folder",
      sourceNodeId: "folder:src",
      pathPrefix: "src",
    });
    expect(scoped.map((n) => n.id).sort()).toEqual([
      "file:src/a.ts",
      "file:src/lib/b.ts",
    ]);
  });

  it("scopes feature member files", () => {
    const feature = {
      id: "feature:x",
      kind: "feature",
      label: "X",
      attrs: { memberFiles: ["pkg/c.ts"] },
    };
    const scope = drillScopeFromMapNode(feature);
    expect(scope?.kind).toBe("feature");
    const scoped = scopeGraphNodes(files, scope!);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.id).toBe("file:pkg/c.ts");
  });

  it("resolves parent folder paths for Up navigation", () => {
    expect(parentFolderPath("src/lib")).toBe("src");
    expect(parentFolderPath("src")).toBe("");
    expect(parentFolderPath("")).toBeNull();
  });

  describe("package drill-in", () => {
    const packageNode = {
      id: "pkg:@demo/web",
      kind: "package" as const,
      label: "@demo/web",
      attrs: { rootDir: "apps/web", fileCount: 2 },
    };
    const monorepoFiles = [
      {
        id: "file:apps/web/a.ts",
        kind: "file" as const,
        label: "apps/web/a.ts",
        attrs: { path: "apps/web/a.ts" },
      },
      {
        id: "file:apps/web/lib/b.ts",
        kind: "file" as const,
        label: "apps/web/lib/b.ts",
        attrs: { path: "apps/web/lib/b.ts" },
      },
      {
        id: "file:apps/api/c.ts",
        kind: "file" as const,
        label: "apps/api/c.ts",
        attrs: { path: "apps/api/c.ts" },
      },
    ];

    it("scopes a package node to its rootDir prefix", () => {
      const scope = drillScopeFromMapNode(packageNode);
      expect(scope).toEqual({
        title: "@demo/web",
        kind: "package",
        sourceNodeId: "pkg:@demo/web",
        pathPrefix: "apps/web",
      });
    });

    it("omits pathPrefix for workspace-root packages", () => {
      const scope = drillScopeFromMapNode({
        ...packageNode,
        attrs: { rootDir: "." },
      });
      expect(scope?.pathPrefix).toBeUndefined();
    });

    it("renders package children from a file-zoom graph, not package nodes", () => {
      const scope = drillScopeFromMapNode(packageNode);
      expect(scope?.pathPrefix).toBe("apps/web");
      const cards = cardEntriesAt(monorepoFiles, scope!.pathPrefix!);
      expect(cards.map((c) => c.name).sort()).toEqual(["a.ts", "lib"]);
      // Package-only graphs (Spectrum before refetch) yield no file cards.
      expect(folderCardEntries([packageNode])).toEqual([]);
      expect(cardEntriesAt([packageNode], "apps/web")).toEqual([]);
    });

    it("filters explorer nodes to the package prefix", () => {
      const scope = drillScopeFromMapNode(packageNode)!;
      expect(
        scopeGraphNodes(monorepoFiles, scope)
          .map((n) => n.id)
          .sort(),
      ).toEqual(["file:apps/web/a.ts", "file:apps/web/lib/b.ts"]);
    });
  });
});
