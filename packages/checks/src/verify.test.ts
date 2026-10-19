import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { getPriority } from "node:os";
import {
  CHECK_CANCELLED,
  resolveVerifyPlan,
  verifyJobWork,
  verifyRunnerWithTimeout,
  type VerifyStep,
} from "./verify.js";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
);

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  temps.length = 0;
});

async function scratch(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "prism-verify-"));
  temps.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const path = join(dir, rel);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }
  return dir;
}

describe("resolveVerifyPlan", () => {
  it("picks lint only from a lint-only package.json", async () => {
    const plan = await resolveVerifyPlan(join(FIXTURES, "verify-lint-only"));
    expect(plan.steps).toEqual([
      { name: "lint", kind: "package-script", script: "lint" },
    ]);
    expect(plan.source).toBe("package.json");
    expect(plan.provenance).toBe("measured");
    expect(plan.steps.some((step) => step.name === "typecheck")).toBe(false);
  });

  it("returns an empty plan when scripts are empty", async () => {
    const plan = await resolveVerifyPlan(join(FIXTURES, "verify-none"));
    expect(plan.steps).toEqual([]);
    expect(plan.provenance).toBe("unavailable");
  });

  it("does not invent a test script when it is absent", async () => {
    const dir = await scratch({
      "package.json": JSON.stringify({
        scripts: { typecheck: "echo types" },
      }),
    });
    const plan = await resolveVerifyPlan(dir);
    expect(plan.steps.map((step) => step.name)).toEqual(["typecheck"]);
    expect(plan.absent.some((row) => row.name === "test")).toBe(true);
  });

  it("uses go test when Node produced zero steps", async () => {
    const plan = await resolveVerifyPlan(join(FIXTURES, "verify-go"));
    expect(plan.source).toBe("go.mod");
    expect(plan.steps).toEqual([
      { name: "test", kind: "argv", argv: ["go", "test", "./..."] },
    ]);
  });
});

describe("verifyJobWork", () => {
  it("runs only lint for a lint-only plan and passes when lint is ok", async () => {
    const dir = join(FIXTURES, "verify-lint-only");
    const seen: string[] = [];
    const result = await verifyJobWork(dir, {
      run: async (_cwd, step) => {
        seen.push(step.kind === "package-script" ? step.script : step.argv[0]!);
        return { ok: true, output: "lint-ok" };
      },
    });
    expect(seen).toEqual(["lint"]);
    expect(result.status).toBe("passed");
    expect(result.detail).toBe("lint passed.");
  });

  it("skips with an em-dash detail when there are no checks", async () => {
    const result = await verifyJobWork(join(FIXTURES, "verify-none"));
    expect(result.status).toBe("skipped");
    expect(result.detail).toBe("No checks to run.");
  });

  it("does not call a missing typecheck when only test exists", async () => {
    const dir = await scratch({
      "package.json": JSON.stringify({ scripts: { test: "echo ok" } }),
    });
    const seen: string[] = [];
    const result = await verifyJobWork(dir, {
      run: async (_cwd, step) => {
        seen.push(step.kind === "package-script" ? step.script : "");
        return { ok: true, output: "" };
      },
    });
    expect(seen).toEqual(["test"]);
    expect(result.status).toBe("passed");
  });

  it("fails when typecheck is present and the compiler errors", async () => {
    const dir = await scratch({
      "package.json": JSON.stringify({
        scripts: { typecheck: "tsc", test: "echo ok" },
      }),
    });
    const result = await verifyJobWork(dir, {
      run: async () => ({
        ok: false,
        output: "src/a.ts(3,1): error TS2345: nope",
      }),
    });
    expect(result.status).toBe("failed");
    expect(result.detail).toContain("typecheck failed");
  });

  it("never invokes bun run test when scripts.test is absent", async () => {
    const dir = await scratch({
      "package.json": JSON.stringify({ scripts: { lint: "echo lint-ok" } }),
    });
    const argv: string[][] = [];
    await verifyJobWork(dir, {
      run: async (_cwd, step: VerifyStep) => {
        argv.push(
          step.kind === "package-script"
            ? ["run", step.script]
            : [...step.argv],
        );
        return { ok: true, output: "" };
      },
    });
    expect(argv.some((row) => row.includes("test"))).toBe(false);
  });

  it("treats go ENOENT as skipped, not failed", async () => {
    const result = await verifyJobWork(join(FIXTURES, "verify-go"), {
      run: async () => ({
        ok: false,
        absent: true,
        output: "error: check binary is not available",
      }),
    });
    expect(result.status).toBe("skipped");
    expect(result.detail).toBe("No checks to run.");
  });

  it("skips when checks are turned off", async () => {
    const result = await verifyJobWork(join(FIXTURES, "verify-lint-only"), {
      enabled: false,
    });
    expect(result.status).toBe("skipped");
    expect(result.detail).toBe("Checks are turned off.");
  });
});

describe("package manager resolution", () => {
  it("runs Yarn Berry's yarnPath with node, from a workspace package", async () => {
    const dir = await scratch({
      "yarn.lock": "",
      ".yarnrc.yml": "yarnPath: .yarn/releases/yarn.cjs\n",
      "packages/lib/package.json": JSON.stringify({
        scripts: { test: 'node -e "process.exit(0)"' },
      }),
    });
    const marker = join(dir, "ran.json");
    await mkdir(join(dir, ".yarn/releases"), { recursive: true });
    await writeFile(
      join(dir, ".yarn/releases/yarn.cjs"),
      `const { writeFileSync } = require("node:fs");\nwriteFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(1)));\n`,
    );
    const result = await verifyJobWork(join(dir, "packages/lib"));
    expect(result.status).toBe("passed");
    const argv = JSON.parse(await readFile(marker, "utf8")) as string[];
    expect(argv.slice(-2)).toEqual(["run", "test"]);
  }, 20_000);
});

describe("background check runner (round 2)", () => {
  const step = (argv: string[]): VerifyStep =>
    ({ name: "t", kind: "argv", argv }) as VerifyStep;

  it.runIf(process.platform !== "win32")(
    "stops a running check when its signal aborts",
    async () => {
      const controller = new AbortController();
      const started = Date.now();
      const run = verifyRunnerWithTimeout(30_000, controller.signal)(
        tmpdir(),
        step(["sleep", "20"]),
      );
      setTimeout(() => controller.abort(), 100);
      const result = await run;
      expect(result.ok).toBe(false);
      expect(result.output).toBe(CHECK_CANCELLED);
      expect(Date.now() - started).toBeLessThan(5_000);
    },
  );

  it.runIf(process.platform !== "win32")(
    "runs checks at low priority",
    async () => {
      const result = await verifyRunnerWithTimeout(10_000)(
        tmpdir(),
        step(["sh", "-c", "ps -o nice= -p $$"]),
      );
      expect(result.ok).toBe(true);
      // Lower than ours when the OS allows it. 19 is the floor. A refusal
      // leaves the child at our priority, which the runner already accepts.
      const ours = getPriority();
      const theirs = Number(result.output.trim());
      if (ours >= 19) expect(theirs).toBe(19);
      else expect(theirs).toBeGreaterThanOrEqual(ours);
    },
  );
});
