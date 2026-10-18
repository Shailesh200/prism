import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyLaunch, scanSurfaces, surfaceProblems } from "./surfaces.js";

describe("surface classification", () => {
  it("tells a workspace build from the published package", () => {
    expect(classifyLaunch("node /repo/packages/mcp-server/dist/bin.js")).toBe(
      "workspace-build",
    );
    expect(classifyLaunch("npx -y @prismapp/mcp-server@latest")).toBe(
      "published-npm",
    );
    expect(classifyLaunch("npx -y @repo-prism/mcp-server@latest")).toBe(
      "published-npm",
    );
    expect(
      classifyLaunch(
        "node /usr/local/lib/node_modules/@repo-prism/cli/node_modules/@repo-prism/mcp-server/dist/bin.js",
      ),
    ).toBe("npm-install");
    expect(
      classifyLaunch(
        "node /p/node_modules/@repo-prism/plugin/dist/pack/hooks/prism-hook.mjs",
      ),
    ).toBe("npm-install");
    expect(classifyLaunch("npx eslint")).toBeNull();
  });

  it("fails a Prism checkout that still launches the published server", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-surfaces-"));
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(
      join(home, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          prism: {
            command: "npx",
            args: ["-y", "@repo-prism/mcp-server@latest"],
          },
        },
      }),
    );
    const hits = scanSurfaces(home);
    expect(hits).toHaveLength(1);
    expect(surfaceProblems(hits, true)).toEqual([
      expect.stringContaining("published-npm"),
    ]);
    expect(surfaceProblems(hits, false)).toEqual([]);
  });
});
