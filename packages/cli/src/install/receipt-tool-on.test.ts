/**
 * receipt-tool-on (Arc, PR 1): every host `installHost` sets up turns the
 * receipt tool on in Prism's config.json, once, with the plan, the backup and
 * the row unchanged; user-scope Cursor gets no rule file.
 *
 * Every run uses a throwaway HOME and PRISM_HOME, never the real home.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HOST_NAMES, runInstall } from "../commands/install.js";
import {
  INSTALL_HOSTS,
  installHost,
  RECEIPT_NOTE,
  type InstallHost,
} from "./hosts.js";
import { planStart } from "./start-plan.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function machine() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "prism-receipt-on-")));
  dirs.push(home);
  expect(home).not.toBe(homedir());
  const pack = join(home, "_pack");
  mkdirSync(join(pack, "hooks"), { recursive: true });
  writeFileSync(join(pack, "hooks", "prism-hook.mjs"), "// hook\n");
  const bin = join(home, "_server", "bin.js");
  mkdirSync(join(home, "_server"));
  writeFileSync(bin, "");
  const root = join(home, "_repo");
  mkdirSync(root);
  mkdirSync(join(home, ".codex"));
  const env = { PRISM_HOME: join(home, ".prism"), PRISM_DAEMON: "0" };
  const config = join(home, ".prism", "config.json");
  const target = (host: InstallHost) => ({
    host,
    scope: "user" as const,
    home,
    root,
    node: process.execPath,
    bin,
    pack,
    env,
  });
  const tools = () =>
    existsSync(config)
      ? (JSON.parse(readFileSync(config, "utf8")) as { extraTools?: string[] })
          .extraTools
      : undefined;
  return {
    home,
    root,
    env,
    config,
    target,
    tools,
    layout: { bin, pack, version: "9.9.9", source: root },
  };
}

describe("installHost turns the receipt tool on for every host", () => {
  for (const host of INSTALL_HOSTS) {
    it(`${host}: on, with one note; a second install adds nothing`, () => {
      const m = machine();
      const first = installHost(m.target(host));
      expect(m.tools()).toEqual(["receipt"]);
      expect(first.notes).toContain(RECEIPT_NOTE);
      const again = installHost(m.target(host));
      expect(again.notes).not.toContain(RECEIPT_NOTE);
      expect(m.tools()).toEqual(["receipt"]);
    });
  }

  it("keeps the user's own extraTools and adds receipt after them", () => {
    const m = machine();
    mkdirSync(join(m.home, ".prism"));
    writeFileSync(m.config, JSON.stringify({ extraTools: ["foo"] }));
    installHost(m.target("claude"));
    expect(m.tools()).toEqual(["foo", "receipt"]);
  });

  it("without env (tests, benches) it leaves config.json alone", () => {
    const m = machine();
    const { env: _env, ...noEnv } = m.target("cursor");
    installHost(noEnv);
    expect(existsSync(m.config)).toBe(false);
  });

  it("runInstall for Claude Code alone turns it on, with one note", async () => {
    const m = machine();
    const result = await runInstall({
      hosts: ["claude", "cursor"],
      scope: "user",
      root: m.root,
      layout: m.layout,
      env: m.env,
      home: m.home,
    });
    expect(result.kind).toBe("done");
    if (result.kind === "done")
      expect(result.notes.filter((n) => n === RECEIPT_NOTE)).toHaveLength(1);
    expect(m.tools()).toEqual(["receipt"]);
  });
});

describe("the plan is the same as before the move", () => {
  it("one receipt row, Prism's, listed last; an existing config.json is backed up", () => {
    const m = machine();
    mkdirSync(join(m.home, ".prism"));
    // A 2.x home (not a 1.x one to move first).
    writeFileSync(join(m.home, ".prism", "version.json"), '{"major":2}');
    writeFileSync(m.config, JSON.stringify({ extraTools: ["foo"] }));
    const plan = planStart({
      hosts: ["claude", "cursor", "opencode"],
      hostNames: HOST_NAMES,
      scope: "user",
      home: m.home,
      root: m.root,
      node: process.execPath,
      bin: m.layout.bin,
      pack: m.layout.pack,
      env: m.env,
      now: new Date("2026-10-17T10:45:41.000Z"),
    });
    const receipt = plan.rows.filter((row) => row.role === "receipt");
    expect(receipt).toEqual([
      { agent: "Prism", path: "~/.prism/config.json", role: "receipt" },
    ]);
    expect(plan.rows.at(-1)?.role).toBe("receipt");
    expect(plan.toBackUp).toContain(m.config);
    // Planned, not written.
    expect(JSON.parse(readFileSync(m.config, "utf8"))).toEqual({
      extraTools: ["foo"],
    });
  });

  it("already on: no receipt row", () => {
    const m = machine();
    mkdirSync(join(m.home, ".prism"));
    writeFileSync(join(m.home, ".prism", "version.json"), '{"major":2}');
    writeFileSync(m.config, JSON.stringify({ extraTools: ["receipt"] }));
    const plan = planStart({
      hosts: ["claude"],
      hostNames: HOST_NAMES,
      scope: "user",
      home: m.home,
      root: m.root,
      node: process.execPath,
      bin: m.layout.bin,
      pack: m.layout.pack,
      env: m.env,
      now: new Date(),
    });
    expect(plan.rows.some((row) => row.role === "receipt")).toBe(false);
  });
});

describe("user-scope Cursor gets no rule file (Arc)", () => {
  it("only the MCP entry: no .cursor/rules in the home or the repo", () => {
    const m = machine();
    const result = installHost(m.target("cursor"));
    expect(existsSync(join(m.home, ".cursor", "rules"))).toBe(false);
    expect(existsSync(join(m.root, ".cursor"))).toBe(false);
    expect(result.files.map((file) => file.path)).toEqual([
      join(m.home, ".cursor", "mcp.json"),
    ]);
  });
});
