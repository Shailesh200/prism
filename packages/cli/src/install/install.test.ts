import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_LENSES } from "@repo-prism/shared/lens-store";
import { afterEach, describe, expect, it } from "vitest";
import {
  cursorRule,
  installHost,
  readBlock,
  removeInstallFile,
  RULE_TEXT,
  writeBlock,
  type InstallHost,
} from "./hosts.js";
import { wipe1x } from "./wipe.js";
import { stillOnDisk } from "../commands/install.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "prism-install-"));
  dirs.push(dir);
  return dir;
}
function put(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}
const custom = (id: string, extra: Record<string, unknown> = {}) => ({
  ...DEFAULT_LENSES[0],
  id,
  name: `Custom ${id}`,
  seededDefault: false,
  ...extra,
});

function dirty1x(): { env: NodeJS.ProcessEnv; home: string } {
  const root = temp();
  const home = join(root, ".prism");
  for (const ws of ["a", "b", "c"])
    put(join(home, "workspaces", ws, "index.json"), "{}");
  put(join(home, "daemon", "daemon.json"), "garbage");
  put(join(home, "hub", "hub.json"), "{}");
  put(join(home, "hook-log"), "x");
  return { env: { PRISM_HOME: home }, home };
}

describe("wipe1x (plan §3.1a)", () => {
  it("WIPE-1: moves 1.x out (not deleted), stops the daemon, writes version.json, one line + event", async () => {
    const { env, home } = dirty1x();
    let stopped = false;
    const out = await wipe1x({
      env,
      stopDaemon: async () => {
        stopped = true;
        return "stopped";
      },
    });
    expect(stopped).toBe(true);
    expect(out.kind).toBe("wiped");
    if (out.kind !== "wiped") return;
    expect(out.line.split("\n")).toHaveLength(1);
    expect(out.line).toContain(".prism-backups/");
    expect(existsSync(join(home, "workspaces"))).toBe(false);
    expect(existsSync(join(home, "hub"))).toBe(false);
    // Moved, not deleted (round 5 consent): all of it is in the backup.
    expect(out.backupDir).toMatch(/\.prism-backups\/\d{8}T\d{6}\/1x$/);
    expect(readdirSync(join(out.backupDir, "workspaces"))).toHaveLength(3);
    expect(existsSync(join(out.backupDir, "hub"))).toBe(true);
    expect(out.backupDir.startsWith(home + "/")).toBe(false);
    expect(
      JSON.parse(readFileSync(join(home, "version.json"), "utf8")).major,
    ).toBe(2);
    expect(readFileSync(join(home, "events.jsonl"), "utf8")).toContain(
      "install.wipe_1x",
    );
  });

  it("WIPE-2: keeps valid custom lenses byte-for-byte, quarantines an unknown check, keeps a renamed built-in", async () => {
    const { env, home } = dirty1x();
    const renamed = { ...DEFAULT_LENSES[0], name: "Prism Architect" };
    const valid = [
      custom("perf"),
      custom("sec", {
        overrules: [
          {
            check: "reuse_missed",
            fingerprint: "abc",
            note: "ok",
            at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
      renamed,
    ];
    put(join(home, "lenses", "lenses.json"), JSON.stringify({ lenses: valid }));
    put(
      join(home, "lenses", "bad.json"),
      JSON.stringify(custom("bad", { checks: ["no_such_check"] })),
    );
    const out = await wipe1x({ env });
    expect(out.kind).toBe("wiped");
    if (out.kind !== "wiped") return;
    const kept = JSON.parse(
      readFileSync(join(home, "lenses", "lenses.json"), "utf8"),
    ).lenses;
    expect(kept.map((l: { id: string }) => l.id)).toEqual([
      "perf",
      "sec",
      renamed.id,
    ]);
    expect(kept[1].overrules).toHaveLength(1);
    expect(kept[2].name).toBe("Prism Architect");
    expect(out.removedDir).toBeDefined();
    // Invalid lens files stay in the backup only.
    expect(out.removedDir?.startsWith(out.backupDir)).toBe(true);
    const removed = readFileSync(
      join(out.removedDir as string, "REMOVED.txt"),
      "utf8",
    );
    expect(removed).toContain("bad");
    // The original lenses folder is kept whole in the backup too.
    expect(existsSync(join(out.backupDir, "lenses", "bad.json"))).toBe(false);
    expect(existsSync(join(out.backupDir, "lenses", "lenses.json"))).toBe(true);
  });

  it("WIPE-3: keeps 2.0 config keys, drops old ones and names them", async () => {
    const { env, home } = dirty1x();
    put(
      join(home, "config.json"),
      JSON.stringify({
        extraTools: ["lens"],
        hubUrl: "http://x",
        legacyMode: 1,
      }),
    );
    const out = await wipe1x({ env });
    if (out.kind !== "wiped") throw new Error(out.kind);
    expect(JSON.parse(readFileSync(join(home, "config.json"), "utf8"))).toEqual(
      { extraTools: ["lens"] },
    );
    expect(out.droppedConfigKeys).toEqual(["hubUrl", "legacyMode"]);
    expect(out.line).toContain("hubUrl, legacyMode");
    // The 1.x config file itself is kept in the backup.
    expect(
      JSON.parse(readFileSync(join(out.backupDir, "config.json"), "utf8")),
    ).toHaveProperty("legacyMode", 1);
  });

  it("WIPE-4: a second run is a no-op", async () => {
    const { env, home } = dirty1x();
    await wipe1x({ env });
    const before = readdirSync(home).sort();
    expect((await wipe1x({ env })).kind).toBe("current");
    expect(readdirSync(home).sort()).toEqual(before);
  });

  it("WIPE-5: truncated lens JSON is moved as invalid; the rest is wiped", async () => {
    const { env, home } = dirty1x();
    put(join(home, "lenses", "a.json"), '{"id": "trunc');
    const out = await wipe1x({ env });
    if (out.kind !== "wiped") throw new Error(out.kind);
    expect(out.invalidLenses).toBe(1);
    expect(existsSync(join(home, "lenses"))).toBe(false);
  });

  it("WIPE-6: a symlinked workspaces folder is unlinked, its target untouched", async () => {
    const { env, home } = dirty1x();
    rmSync(join(home, "workspaces"), { recursive: true });
    const target = join(temp(), "other-disk");
    put(join(target, "keep.txt"), "keep");
    symlinkSync(target, join(home, "workspaces"));
    await wipe1x({ env });
    expect(existsSync(join(home, "workspaces"))).toBe(false);
    expect(readFileSync(join(target, "keep.txt"), "utf8")).toBe("keep");
  });

  it.skipIf(process.getuid?.() === 0)(
    "WIPE-7: an unwritable folder stops with the path and fix; nothing changed",
    async () => {
      const { env, home } = dirty1x();
      put(
        join(home, "lenses", "lenses.json"),
        JSON.stringify({ lenses: [custom("perf")] }),
      );
      chmodSync(join(home, "lenses"), 0o500);
      try {
        const out = await wipe1x({ env });
        expect(out.kind).toBe("permission");
        if (out.kind === "permission") {
          expect(out.path).toBe(join(home, "lenses"));
          expect(out.fix).toContain("chmod");
        }
        expect(existsSync(join(home, "workspaces", "a"))).toBe(true);
        expect(existsSync(join(home, "version.json"))).toBe(false);
      } finally {
        chmodSync(join(home, "lenses"), 0o700);
      }
    },
  );

  it("WIPE-8: a clean machine gets version.json and no line", async () => {
    const home = join(temp(), ".prism");
    const out = await wipe1x({ env: { PRISM_HOME: home } });
    expect(out.kind).toBe("clean");
    expect(
      JSON.parse(readFileSync(join(home, "version.json"), "utf8")).major,
    ).toBe(2);
  });
});

describe("host writers (plan §2.1, §5.10)", () => {
  function target(host: InstallHost, scope: "user" | "project" = "user") {
    const home = temp();
    const root = temp();
    const pack = temp();
    put(join(pack, "hooks", "prism-hook.mjs"), "");
    put(join(pack, "skills", "prism", "SKILL.md"), "# skill");
    return {
      host,
      scope,
      home,
      root,
      node: "/usr/bin/node",
      bin: "/opt/prism/bin.js",
      pack,
    };
  }

  it("claude: MCP server, hooks and skills; uninstall restores the user's own settings", () => {
    const t = target("claude");
    const settings = join(t.home, ".claude", "settings.json");
    put(
      settings,
      JSON.stringify({
        theme: "dark",
        hooks: { Stop: [{ hooks: [{ type: "command", command: "mine" }] }] },
      }),
    );
    const result = installHost(t);
    const written = JSON.parse(readFileSync(settings, "utf8"));
    expect(written.hooks.Stop).toHaveLength(2);
    // Round 4: the session-end verdict rides a background Stop hook.
    const stops = written.hooks.Stop[1].hooks;
    expect(
      stops.map((h: { command: string }) => h.command.split(" ").pop()),
    ).toEqual(["stop", "stop-wait"]);
    expect(stops[0].asyncRewake).toBeUndefined();
    expect(stops[1]).toMatchObject({ asyncRewake: true, timeout: 120 });
    expect(written.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
      "prism-hook.mjs",
    );
    expect(
      JSON.parse(readFileSync(join(t.home, ".claude.json"), "utf8")).mcpServers
        .prism.args,
    ).toEqual([t.bin]);
    // Its prompt hook shows the Prism line and lens; prepare_change must not.
    expect(
      JSON.parse(readFileSync(join(t.home, ".claude.json"), "utf8")).mcpServers
        .prism.env.PRISM_PROMPT_HOOK,
    ).toBe("1");
    expect(
      existsSync(join(t.home, ".claude", "skills", "prism", "SKILL.md")),
    ).toBe(true);
    const retired = join(t.home, ".claude", "skills", "prism-onboard");
    put(join(retired, "SKILL.md"), "# old");
    installHost(t); // idempotent: no duplicate hooks
    expect(existsSync(retired)).toBe(false);
    expect(JSON.parse(readFileSync(settings, "utf8")).hooks.Stop).toHaveLength(
      2,
    );
    for (const file of result.files) removeInstallFile(file);
    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({
      theme: "dark",
      hooks: { Stop: [{ hooks: [{ type: "command", command: "mine" }] }] },
    });
    // Prism created ~/.claude.json: nothing of the user's was in it, so it goes.
    expect(existsSync(join(t.home, ".claude.json"))).toBe(false);
  });

  it("uninstall keeps the user's other keys and leaves no empty files or folders", () => {
    const t = target("cursor", "project");
    const mcp = join(t.root, ".cursor", "mcp.json");
    const result = installHost(t);
    for (const file of result.files) removeInstallFile(file);
    expect(existsSync(join(t.root, ".cursor"))).toBe(false);

    put(mcp, JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    const again = installHost(t);
    for (const file of again.files) removeInstallFile(file);
    expect(JSON.parse(readFileSync(mcp, "utf8"))).toEqual({
      mcpServers: { other: { command: "x" } },
    });
    expect(existsSync(join(t.root, ".cursor", "rules"))).toBe(false);
  });

  it("a second install writes nothing; a changed skill is copied again", () => {
    const t = target("claude");
    const o = { ...t, host: "opencode" as const };
    const files = [...installHost(t).files, ...installHost(o).files];
    const skill = join(t.home, ".claude", "skills", "prism", "SKILL.md");
    const paths = [
      ...files.map((f) => f.path).filter((p) => !p.endsWith("prism")),
      skill,
    ];
    const inode = (p: string) => statSync(p).ino;
    const before = paths.map(inode);
    installHost(t);
    installHost(o);
    // atomicWrite renames a temp file in, so a rewrite gets a new inode.
    expect(paths.map(inode)).toEqual(before);
    put(join(t.pack, "skills", "prism", "SKILL.md"), "# skill v2");
    installHost(t);
    expect(readFileSync(skill, "utf8")).toBe("# skill v2");
  });

  it("cursor --project writes the always-apply rule with the receipt line", () => {
    const t = target("cursor", "project");
    installHost(t);
    const rule = readFileSync(
      join(t.root, ".cursor", "rules", "prism.mdc"),
      "utf8",
    );
    expect(rule).toBe(cursorRule());
    expect(rule).toContain("alwaysApply: true");
    expect(rule).toContain("call the Prism `receipt` tool");
  });

  it("codex: managed config.toml and AGENTS.md blocks next to user text", () => {
    const t = target("codex");
    const agents = join(t.home, ".codex", "AGENTS.md");
    put(agents, "# My rules\n");
    const result = installHost(t);
    expect(
      readFileSync(join(t.home, ".codex", "config.toml"), "utf8"),
    ).toContain("[mcp_servers.prism]");
    expect(
      readFileSync(join(t.home, ".codex", "config.toml"), "utf8"),
    ).not.toContain("PRISM_PROMPT_HOOK");
    expect(readBlock(agents, "md")).toBe(RULE_TEXT);
    for (const file of result.files) removeInstallFile(file);
    expect(readFileSync(agents, "utf8")).toBe("# My rules\n");
    expect(existsSync(join(t.home, ".codex", "config.toml"))).toBe(false);
  });

  it("opencode: MCP entry, plugin shim and AGENTS.md block", () => {
    const t = target("opencode");
    installHost(t);
    const config = JSON.parse(
      readFileSync(
        join(t.home, ".config", "opencode", "opencode.json"),
        "utf8",
      ),
    );
    expect(config.mcp.prism).toMatchObject({
      type: "local",
      command: [t.node, t.bin],
      enabled: true,
    });
    const shim = readFileSync(
      join(t.home, ".config", "opencode", "plugins", "prism.js"),
      "utf8",
    );
    expect(shim).toContain("tool.execute.before");
    expect(shim).toContain(join(t.pack, "hooks", "prism-hook.mjs"));
  });

  it("writeBlock replaces its own block in place", () => {
    const path = join(temp(), "AGENTS.md");
    writeBlock(path, "md", "one");
    writeBlock(path, "md", "two");
    expect(readFileSync(path, "utf8").match(/prism:begin/g)).toHaveLength(1);
    expect(readBlock(path, "md")).toBe("two");
  });
});

describe("install record", () => {
  it("drops a recorded file an install has since removed, keeps the rest", () => {
    const dir = temp();
    const kept = join(dir, "skills", "prism");
    put(join(kept, "SKILL.md"), "x");
    const files = stillOnDisk([
      { kind: "file", path: kept },
      { kind: "file", path: join(dir, "skills", "prism-lens") },
      {
        kind: "json-key",
        path: join(dir, "absent.json"),
        key: ["mcpServers", "prism"],
      },
    ]);
    expect(files.map((f) => f.path)).toEqual([kept, join(dir, "absent.json")]);
  });
});
