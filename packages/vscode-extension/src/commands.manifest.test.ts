import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json",
);

describe("extension contributes (M-057)", () => {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    contributes: {
      commands: Array<{ command: string }>;
      keybindings?: Array<{ command: string }>;
      menus?: Record<string, Array<{ command: string }>>;
      configuration: {
        properties: Record<string, { default?: unknown }>;
      };
    };
  };

  it("registers review-all and blast quick pick", () => {
    const names = pkg.contributes.commands.map((c) => c.command);
    expect(names).toContain("prism.reviewAllChanges");
    expect(names).toContain("prism.blastQuickPick");
  });

  it("contributes keybindings for blast + review-all", () => {
    const keys = (pkg.contributes.keybindings ?? []).map((k) => k.command);
    expect(keys).toContain("prism.blastQuickPick");
    expect(keys).toContain("prism.reviewAllChanges");
  });

  it("adds Review All Changes to the SCM title menu", () => {
    const scmTitle = pkg.contributes.menus?.["scm/title"] ?? [];
    expect(scmTitle.some((m) => m.command === "prism.reviewAllChanges")).toBe(
      true,
    );
  });

  it("defaults CodeLens to on", () => {
    expect(
      pkg.contributes.configuration.properties["prism.codeLens.enabled"]
        ?.default,
    ).toBe(true);
  });

  it("exposes Switch Workspace Folder for multi-root workspaces (P-B7)", () => {
    const names = pkg.contributes.commands.map((c) => c.command);
    expect(names).toContain("prism.switchWorkspaceFolder");
  });
});
