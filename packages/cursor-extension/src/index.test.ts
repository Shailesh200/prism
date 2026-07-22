import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CORE_PACKAGE, IMPLEMENTS_PACKAGE, PACKAGE_NAME } from "./index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@prism/cursor-extension", () => {
  it("exports package identity", () => {
    expect(PACKAGE_NAME).toBe("@prism/cursor-extension");
    expect(IMPLEMENTS_PACKAGE).toBe("@prism/vscode-extension");
    expect(CORE_PACKAGE).toBe("@prism/core");
  });

  it("manifest is a Cursor-branded VS Code extension overlay", () => {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as {
      displayName: string;
      main: string;
      engines: { vscode: string };
      contributes: { commands: { command: string }[] };
    };
    expect(pkg.displayName).toMatch(/Cursor/i);
    expect(pkg.main).toBe("./dist/extension.cjs");
    expect(pkg.engines.vscode).toBeTruthy();
    const ids = pkg.contributes.commands.map((c) => c.command);
    expect(ids).toContain("prism.open");
    expect(ids).toContain("prism.reindex");
  });

  it("staged build points at the shared extension host (when built)", () => {
    const marker = join(root, "dist", "CURSOR_OVERLAY.json");
    const extension = join(root, "dist", "extension.cjs");
    if (!existsSync(extension)) {
      // Build may not have run in unit isolation; skip soft.
      expect(PACKAGE_NAME).toBe("@prism/cursor-extension");
      return;
    }
    expect(existsSync(marker)).toBe(true);
    const meta = JSON.parse(readFileSync(marker, "utf8")) as {
      implements: string;
      core: string;
    };
    expect(meta.implements).toBe(IMPLEMENTS_PACKAGE);
    expect(meta.core).toBe(CORE_PACKAGE);
  });
});
