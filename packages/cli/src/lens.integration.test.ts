import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const binary = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "cli.js",
);
const home = mkdtempSync(join(tmpdir(), "prism-lens-cli-home-"));
const repo = mkdtempSync(join(tmpdir(), "prism-lens-cli-repo-"));
execFileSync("git", ["init", "-q"], { cwd: repo });

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

function prism(...args: string[]) {
  return spawnSync(process.execPath, [binary, ...args, "--json"], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, PRISM_HOME: home, NO_COLOR: "1" },
  });
}

describe("prism lens (plan §5.3)", () => {
  it("CL-6/CL-14: adds a lens with triggers, only under ~/.prism/lenses", () => {
    const result = prism(
      "lens",
      "add",
      "perf",
      "--role",
      "Checks hot paths.",
      "--focus",
      "No new N+1 query.",
      "--checklist",
      "No query in a loop.",
      "--trigger",
      "slow query",
      "--trigger",
      "performance regression",
      "--checks",
      "untested_changed_symbol,new_dependency_added",
    );
    expect(result.status).toBe(0);
    const stored = JSON.parse(
      readFileSync(join(home, "lenses", "lenses.json"), "utf8"),
    ) as { lenses: { id: string; triggers: string[]; checks: string[] }[] };
    const perf = stored.lenses.find((lens) => lens.id === "perf");
    expect(perf?.triggers).toEqual(["slow query", "performance regression"]);
    expect(perf?.checks).toEqual([
      "untested_changed_symbol",
      "new_dependency_added",
    ]);
    expect(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: repo,
        encoding: "utf8",
      }),
    ).toBe("");
    expect(existsSync(join(repo, ".prism"))).toBe(false);
  });

  it("CL-13: refuses a short or built-in trigger with exit 2", () => {
    for (const trigger of ["fix", "review"]) {
      const result = prism(
        "lens",
        "add",
        `bad-${trigger}`,
        "--role",
        "r",
        "--focus",
        "f",
        "--checklist",
        "c",
        "--trigger",
        trigger,
      );
      expect(result.status).toBe(2);
    }
  });

  it("CL-5: refuses an unknown check with exit 2 and lists the valid ones", () => {
    const result = prism(
      "lens",
      "add",
      "sec",
      "--role",
      "r",
      "--focus",
      "f",
      "--checklist",
      "c",
      "--checks",
      "no_such_check",
    );
    expect(result.status).toBe(2);
    expect(result.stdout + result.stderr).toMatch(
      /Valid checks: new_cross_package_edge/,
    );
  });

  it("CL-4: a built-in lens cannot be removed; a custom one can", () => {
    expect(prism("lens", "remove", "qa").status).toBe(2);
    expect(prism("lens", "remove", "perf").status).toBe(0);
  });
});
