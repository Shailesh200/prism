import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../program.js";
import { buildLabel, layoutLabel, packageLayout } from "./install.js";

const dirs: string[] = [];
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

async function prism(argv: string[]) {
  let out = "";
  const code = await run(argv, {
    cwd: process.env.HOME!,
    env: process.env,
    isTty: false,
    writer: { out: (t) => (out += t), err: () => undefined },
  });
  return { code, out };
}

describe("prism install: Codex only when ~/.codex exists", () => {
  it("skips Codex without ~/.codex and installs the rest of `all`", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-install-home-"));
    dirs.push(home);
    Object.assign(process.env, {
      HOME: home,
      PRISM_HOME: join(home, ".prism"),
      PRISM_DAEMON: "0",
    });
    const codex = await prism(["install", "codex"]);
    expect(codex.code).toBe(0);
    expect(codex.out).toContain("Codex not found; skipped.");
    expect(existsSync(join(home, ".codex"))).toBe(false);

    const all = await prism(["install", "all"]);
    expect(all.out).toContain("Codex not found; skipped.");
    expect(all.out).toContain("installed for Claude Code");
    expect(existsSync(join(home, ".codex"))).toBe(false);

    mkdirSync(join(home, ".codex"));
    const again = await prism(["install", "codex"]);
    expect(again.out).toContain("installed for Codex");
    expect(existsSync(join(home, ".codex", "config.toml"))).toBe(true);
  });
});

describe("install record and build label", () => {
  it("keeps the first installedAt and stamps updatedAt on each install", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-install-home-"));
    dirs.push(home);
    mkdirSync(join(home, ".cursor"));
    Object.assign(process.env, {
      HOME: home,
      PRISM_HOME: join(home, ".prism"),
      PRISM_DAEMON: "0",
    });
    const record = () =>
      JSON.parse(readFileSync(join(home, ".prism", "install.json"), "utf8"));
    await prism(["install", "cursor"]);
    const first = record();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prism(["install", "cursor"]);
    const second = record();
    expect(second.installedAt).toBe(first.installedAt);
    expect(second.updatedAt > first.updatedAt).toBe(true);
  });

  it("marks a checkout with uncommitted changes as +dirty", () => {
    const repo = mkdtempSync(join(tmpdir(), "prism-build-label-"));
    dirs.push(repo);
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    git("init", "-q");
    writeFileSync(join(repo, "a.txt"), "a");
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "a");
    const clean = buildLabel(repo);
    expect(clean).toMatch(/^[0-9a-f]{7}$/);
    writeFileSync(join(repo, "a.txt"), "b");
    expect(buildLabel(repo)).toBe(`${clean}+dirty`);
  });
});

describe("install from the npm packages (`npm i -g @repo-prism/cli`)", () => {
  /** A global npm layout: the CLI with its server and plugin as dependencies. */
  function globalPrefix(serverVersion = "2.0.0") {
    const prefix = mkdtempSync(join(tmpdir(), "prism-npm-prefix-"));
    dirs.push(prefix);
    const cli = join(prefix, "lib", "node_modules", "@repo-prism", "cli");
    const deps = join(cli, "node_modules", "@repo-prism");
    const pkg = (dir: string, version: string) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
    };
    pkg(cli, "2.0.0");
    pkg(join(deps, "mcp-server"), serverVersion);
    pkg(join(deps, "plugin"), "2.0.0");
    mkdirSync(join(deps, "mcp-server", "dist"));
    writeFileSync(join(deps, "mcp-server", "dist", "bin.js"), "");
    mkdirSync(join(deps, "plugin", "dist", "pack", "hooks"), {
      recursive: true,
    });
    writeFileSync(
      join(deps, "plugin", "dist", "pack", "hooks", "prism-hook.mjs"),
      "",
    );
    return { cli, deps };
  }

  it("finds the installed server and plugin pack, with no checkout", () => {
    const { cli, deps } = globalPrefix();
    const layout = packageLayout(cli);
    expect(layout).toEqual({
      bin: join(deps, "mcp-server", "dist", "bin.js"),
      pack: join(deps, "plugin", "dist", "pack"),
      version: "2.0.0",
    });
    expect(layoutLabel(layout as Exclude<typeof layout, string>)).toBe(
      "npm package",
    );
  });

  it("refuses a server whose version does not match the CLI", () => {
    const { cli } = globalPrefix("2.0.1");
    expect(packageLayout(cli)).toMatch(/2\.0\.1 does not match.*2\.0\.0/);
  });

  it("names the missing package when the server is not installed", () => {
    const { cli, deps } = globalPrefix();
    rmSync(join(deps, "mcp-server"), { recursive: true });
    expect(packageLayout(cli)).toMatch(/missing @repo-prism\/mcp-server\)/);
  });
});
