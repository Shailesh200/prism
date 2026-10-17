/**
 * Yarn Plug'n'Play runner detection. The PnP fixture is a few files in a temp
 * folder: `.pnp.cjs`, `.yarnrc.yml` with a `yarnPath`, and a package.json.
 * Nothing is installed or run.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectTestRunner, resolveScopedPlan, toolArgv } from "./scoped.js";
import { findPnpRoot, yarnCommand } from "./verify.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function put(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

/** es-toolkit's shape: Yarn 4 PnP, `yarnPath`, vitest in devDependencies. */
function pnpRepo(
  opts: {
    yarnPath?: boolean;
    scripts?: Record<string, string>;
    deps?: Record<string, string>;
  } = {},
): string {
  const root = mkdtempSync(join(tmpdir(), "prism-pnp-"));
  dirs.push(root);
  put(join(root, ".pnp.cjs"), "// pnp map\n");
  put(join(root, "yarn.lock"), "# yarn lockfile v8\n");
  if (opts.yarnPath !== false) {
    put(join(root, ".yarn", "releases", "yarn-4.9.1.cjs"), "// yarn\n");
    put(
      join(root, ".yarnrc.yml"),
      "nodeLinker: pnp\nyarnPath: .yarn/releases/yarn-4.9.1.cjs\n",
    );
  }
  put(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      scripts: opts.scripts ?? { test: "vitest run --coverage" },
      devDependencies: opts.deps ?? { vitest: "^3" },
    }),
  );
  return root;
}

const yarn = (root: string) => [
  process.execPath,
  join(root, ".yarn", "releases", "yarn-4.9.1.cjs"),
];

describe("Yarn PnP runner detection", () => {
  it("finds the PnP root at or above a folder", () => {
    const root = pnpRepo();
    mkdirSync(join(root, "packages", "a"), { recursive: true });
    expect(findPnpRoot(join(root, "packages", "a"))).toBe(root);
    expect(findPnpRoot(tmpdir())).toBeNull();
  });

  it("ignores a stray .pnp.cjs above the repo root (.git)", async () => {
    const outer = mkdtempSync(join(tmpdir(), "prism-stray-"));
    dirs.push(outer);
    put(join(outer, ".pnp.cjs"), "// someone else's pnp map\n");
    put(join(outer, "yarn.lock"), "# yarn lockfile v8\n");
    const repo = join(outer, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    put(
      join(repo, "package.json"),
      JSON.stringify({
        scripts: { test: "vitest run" },
        devDependencies: { vitest: "^3" },
      }),
    );
    mkdirSync(join(repo, "packages", "a"), { recursive: true });
    expect(findPnpRoot(repo)).toBeNull();
    expect(findPnpRoot(join(repo, "packages", "a"))).toBeNull();
    expect(toolArgv(repo, "vitest")).toBeNull();
    expect(detectTestRunner(repo)).toBeNull();
    const plan = await resolveScopedPlan(repo, ["src/a.test.ts"]);
    expect(plan.testMode).not.toBe("scoped");
  });

  it("a worktree's .git file also stops the walk", () => {
    const outer = mkdtempSync(join(tmpdir(), "prism-stray-wt-"));
    dirs.push(outer);
    put(join(outer, ".pnp.cjs"), "// pnp map\n");
    const repo = join(outer, "wt");
    put(join(repo, ".git"), "gitdir: /elsewhere/.git/worktrees/wt\n");
    expect(findPnpRoot(repo)).toBeNull();
  });

  it("a .pnp.cjs at the repo root itself is still used", () => {
    const root = pnpRepo();
    mkdirSync(join(root, ".git"), { recursive: true });
    mkdirSync(join(root, "packages", "a"), { recursive: true });
    expect(findPnpRoot(join(root, "packages", "a"))).toBe(root);
  });

  it("vitest under PnP runs as `yarn vitest run` through yarnPath", () => {
    const root = pnpRepo();
    expect(detectTestRunner(root)).toEqual({
      id: "vitest",
      argv: [...yarn(root), "vitest", "run"],
    });
  });

  it("without yarnPath it uses `yarn` on PATH", () => {
    const root = pnpRepo({ yarnPath: false });
    expect(detectTestRunner(root)?.argv).toEqual(["yarn", "vitest", "run"]);
  });

  it("jest under PnP, found from the script alone", () => {
    const root = pnpRepo({ scripts: { test: "jest" }, deps: {} });
    expect(detectTestRunner(root)?.argv).toEqual([
      ...yarn(root),
      "jest",
      "--passWithNoTests",
    ]);
  });

  it("a workspace package inside a PnP repo runs yarn from the PnP root", () => {
    const root = pnpRepo();
    const pkg = join(root, "packages", "a");
    put(
      join(pkg, "package.json"),
      JSON.stringify({ scripts: { test: "vitest" } }),
    );
    expect(detectTestRunner(pkg)?.argv).toEqual([
      ...yarn(root),
      "vitest",
      "run",
    ]);
  });

  it("node_modules/.bin wins over PnP; neither means no runner (never npx)", () => {
    const root = pnpRepo();
    put(join(root, "node_modules", ".bin", "vitest"), "");
    expect(toolArgv(root, "vitest")).toEqual([
      join(root, "node_modules", ".bin", "vitest"),
    ]);
    const plain = mkdtempSync(join(tmpdir(), "prism-nopnp-"));
    dirs.push(plain);
    put(
      join(plain, "package.json"),
      JSON.stringify({ scripts: { test: "vitest" } }),
    );
    expect(toolArgv(plain, "vitest")).toBeNull();
    expect(detectTestRunner(plain)).toBeNull();
  });

  it("yarnCommand keeps `yarn run <script>` on yarnPath for package scripts", () => {
    const root = pnpRepo();
    expect(yarnCommand(root, ["run", "test"])).toEqual([
      ...yarn(root),
      "run",
      "test",
    ]);
    expect(yarnCommand(pnpRepo({ yarnPath: false }), ["run", "test"])).toEqual([
      "yarn",
      "run",
      "test",
    ]);
  });

  it("es-toolkit's real shape scopes the test step to the reached files", async () => {
    // Scripts and .yarnrc.yml as in toss/es-toolkit main: PnP is Yarn 4's
    // default, so the file has only yarnPath, no nodeLinker line.
    const root = pnpRepo({
      scripts: { test: "vitest --coverage", typecheck: "tsc --noEmit" },
      deps: { vitest: "^3", typescript: "^5" },
    });
    put(join(root, ".yarnrc.yml"), "yarnPath: .yarn/releases/yarn-4.9.1.cjs\n");
    const plan = await resolveScopedPlan(root, ["src/add.spec.ts"]);
    expect(plan.testMode).toBe("scoped");
    expect(plan.plan.steps.find((s) => s.name === "test")).toEqual({
      name: "test",
      kind: "argv",
      argv: [...yarn(root), "vitest", "run", "src/add.spec.ts"],
    });
  });
});
