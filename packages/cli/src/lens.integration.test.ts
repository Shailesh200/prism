import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

  it("show prints one lens; an unknown id is a usage error", () => {
    const shown = prism("lens", "show", "perf");
    expect(shown.status).toBe(0);
    const lens = JSON.parse(shown.stdout).data as {
      id: string;
      triggers: string[];
    };
    expect(lens.id).toBe("perf");
    expect(lens.triggers).toContain("slow query");
    const human = spawnSync(
      process.execPath,
      [binary, "lens", "show", "perf"],
      {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, PRISM_HOME: home, NO_COLOR: "1" },
      },
    );
    expect(human.stdout).toContain("focus: No new N+1 query.");
    const missing = prism("lens", "show", "nope");
    expect(missing.status).toBe(2);
    expect(missing.stdout).toContain('No lens named \\"nope\\"');
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

describe("prism review --lens (round 4)", () => {
  it("adds the lens's checks on the reviewed paths; an unknown lens exits 2", () => {
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    writeFileSync(
      join(repo, "math.ts"),
      "export function add(a: number, b: number) {\n  return a + b;\n}\n",
    );
    writeFileSync(
      join(repo, "main.ts"),
      'import { add } from "./math";\nexport const two = add(1, 1);\n',
    );
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
    writeFileSync(
      join(repo, "math.ts"),
      "export function add(a: number, b: number, c = 0) {\n  return a + b + c;\n}\n",
    );
    const review = prism("review", "--lens", "qa");
    expect(review.status).toBe(0);
    const data = JSON.parse(review.stdout).data as {
      items: { path: string }[];
      lensFindings: { lens: string; check: string; status: string }[];
    };
    expect(data.items.map((item) => item.path)).toEqual(["math.ts"]);
    expect(data.lensFindings.length).toBeGreaterThan(0);
    expect(data.lensFindings.every((f) => f.lens === "qa")).toBe(true);
    const dependents = data.lensFindings.find(
      (f) => f.check === "dependents_not_in_diff",
    );
    expect(dependents?.status).not.toBe("pass");
    const human = spawnSync(
      process.execPath,
      [binary, "review", "--lens", "qa"],
      {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, PRISM_HOME: home, NO_COLOR: "1" },
      },
    );
    expect(human.stdout).toContain("QA lens");
    expect(human.stdout).toContain("dependents not in diff");
    const unknown = prism("review", "--lens", "nope");
    expect(unknown.status).toBe(2);
    expect(unknown.stderr + unknown.stdout).toContain("No lens named nope");
  });
});
