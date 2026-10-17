/**
 * PR 10, install safety: no data loss.
 * J-16: uninstall takes back only Prism's entry; a file or key the user had
 * stays byte-for-byte, a file Prism created goes.
 * J-15: a write that fails part-way puts every config back, leaves no temp
 * file, and records whatever could not be put back so uninstall finds it.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inject = vi.hoisted(() => ({
  /** Rename onto a path matching this fails with EBUSY (a read-only bind). */
  renameTo: null as RegExp | null,
  /** rmSync of a path matching this fails (a rollback that cannot finish). */
  rmPath: null as RegExp | null,
  renameCode: "EBUSY",
  writes: [] as string[],
}));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    renameSync: (from: string, to: string) => {
      if (inject.renameTo?.test(String(to))) {
        throw Object.assign(
          new Error(`${inject.renameCode}: rename '${from}' -> '${to}'`),
          { code: inject.renameCode, syscall: "rename", path: from, dest: to },
        );
      }
      return real.renameSync(from, to);
    },
    writeFileSync: (...args: Parameters<typeof real.writeFileSync>) => {
      inject.writes.push(String(args[0]));
      return real.writeFileSync(...args);
    },
    rmSync: (path: string, options?: import("node:fs").RmOptions) => {
      if (inject.rmPath?.test(String(path))) {
        throw Object.assign(
          new Error(`EPERM: operation not permitted, unlink '${path}'`),
          {
            code: "EPERM",
            path,
          },
        );
      }
      return real.rmSync(path, options);
    },
  };
});

const { run } = await import("../program.js");
const { failureReason, installFailureMessage } =
  await import("../commands/install.js");
const { atomicWrite, withJournal } = await import("./hosts.js");

// Set and restore keys in place: replacing `process.env` would detach it
// from the real environment, and `os.homedir()` would stop seeing HOME.
const KEYS = [
  "HOME",
  "PRISM_HOME",
  "PRISM_DAEMON",
  "PRISM_HOOK_REFRESH",
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let home = "";
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "prism-pr10-home-"));
  process.env.HOME = home;
  process.env.PRISM_HOME = join(home, ".prism");
  process.env.PRISM_DAEMON = "0";
  process.env.PRISM_HOOK_REFRESH = "0";
  expect(homedir()).toBe(home);
});
afterEach(() => {
  inject.renameTo = null;
  inject.rmPath = null;
  inject.renameCode = "EBUSY";
  inject.writes = [];
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  rmSync(home, { recursive: true, force: true });
});

async function prism(argv: string[]) {
  let out = "";
  let err = "";
  const code = await run(argv, {
    cwd: home,
    env: process.env,
    isTty: false,
    writer: { out: (t) => (out += t), err: (t) => (err += t) },
  });
  return { code, out, err };
}

function put(rel: string, text: string): string {
  const path = join(home, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
  return path;
}

/** Every file under home (except Prism's own state), with its bytes. */
function snapshot(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (path.startsWith(join(home, ".prism"))) continue;
      if (entry.isDirectory()) walk(path);
      else out.set(path.slice(home.length), readFileSync(path, "utf8"));
    }
  };
  walk(home);
  return out;
}

function tempFiles(): string[] {
  return [...snapshot().keys()].filter((p) => /\.prism-\d+\.tmp$/.test(p));
}

describe("J-16: uninstall removes only Prism's entry", () => {
  it("a user's mcp.json with other servers comes back byte-for-byte (compact and pretty)", async () => {
    const compact = put(
      ".cursor/mcp.json",
      '{"mcpServers":{"other":{"command":"x","args":["--y"]}},"theme":"dark"}',
    );
    const before = readFileSync(compact, "utf8");
    expect((await prism(["install", "cursor"])).code).toBe(0);
    const during = JSON.parse(readFileSync(compact, "utf8"));
    expect(Object.keys(during.mcpServers)).toEqual(["other", "prism"]);
    expect((await prism(["uninstall"])).code).toBe(0);
    expect(readFileSync(compact, "utf8")).toBe(before);

    const pretty = `${JSON.stringify({ mcpServers: { other: { command: "x" } } }, null, 4)}\n`;
    writeFileSync(compact, pretty);
    await prism(["install", "cursor"]);
    await prism(["uninstall"]);
    expect(readFileSync(compact, "utf8")).toBe(pretty);
  });

  it("Scout's case: a user's `{\"mcpServers\": {}}` is not deleted", async () => {
    const path = put(".cursor/mcp.json", '{"mcpServers": {}}');
    await prism(["install", "cursor"]);
    await prism(["uninstall"]);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe('{"mcpServers":{}}');
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ mcpServers: {} });
  });

  it("an empty user file stays; Claude settings without hooks come back as they were", async () => {
    const claudeJson = put(".claude.json", '{\n  "numStartups": 3\n}\n');
    const settings = put(".claude/settings.json", '{\n  "theme": "dark"\n}\n');
    const userHooks = put(".claude/../.claude/settings.local.json", "{}\n");
    const before = snapshot();
    expect((await prism(["install", "claude"])).code).toBe(0);
    expect(readFileSync(settings, "utf8")).toContain('"hooks"');
    await prism(["uninstall"]);
    expect(readFileSync(claudeJson, "utf8")).toBe(before.get("/.claude.json"));
    expect(readFileSync(settings, "utf8")).toBe(
      before.get("/.claude/settings.json"),
    );
    expect(readFileSync(userHooks, "utf8")).toBe("{}\n");
    expect(snapshot()).toEqual(before);
  });

  it("files Prism created are removed; a user's Codex config keeps its own text", async () => {
    mkdirSync(join(home, ".cursor"));
    mkdirSync(join(home, ".codex"));
    await prism(["install", "cursor"]);
    await prism(["install", "codex"]);
    expect(existsSync(join(home, ".cursor/mcp.json"))).toBe(true);
    expect(existsSync(join(home, ".codex/config.toml"))).toBe(true);
    await prism(["uninstall"]);
    expect(existsSync(join(home, ".cursor/mcp.json"))).toBe(false);
    expect(existsSync(join(home, ".codex/config.toml"))).toBe(false);
    expect(existsSync(join(home, ".codex/AGENTS.md"))).toBe(false);

    const toml = put(".codex/config.toml", 'model = "o3"\n');
    const agents = put(".codex/AGENTS.md", "");
    await prism(["install", "codex"]);
    await prism(["uninstall"]);
    expect(readFileSync(toml, "utf8")).toBe('model = "o3"\n');
    expect(existsSync(agents)).toBe(true);
    expect(readFileSync(agents, "utf8")).toBe("");
  });

  it("a re-install keeps the first install's answer (the file is still Prism's)", async () => {
    mkdirSync(join(home, ".cursor"));
    await prism(["install", "cursor"]);
    await prism(["install", "cursor"]);
    const record = JSON.parse(
      readFileSync(join(home, ".prism/install.json"), "utf8"),
    );
    const entry = record.files.find((f: { path: string }) =>
      f.path.endsWith("mcp.json"),
    );
    expect(entry).toMatchObject({ created: true, existingDepth: 0 });
    await prism(["uninstall"]);
    expect(existsSync(join(home, ".cursor/mcp.json"))).toBe(false);
  });
});

describe("J-15: no half-written install", () => {
  /** Scout's fix-2 QA row 12: Claude and Cursor are written, then Codex's rename fails. */
  function scoutHome() {
    put(".claude.json", '{"numStartups":3}');
    put(".claude/settings.json", '{\n  "theme": "dark"\n}\n');
    put(".cursor/mcp.json", '{"mcpServers":{"other":{"command":"x"}}}');
    put(".codex/config.toml", 'model = "o3"\n');
    inject.renameTo = /\.codex[/\\]config\.toml$/;
  }

  it("EBUSY on ~/.codex/config.toml: every config byte-identical, no temp file, no record", async () => {
    scoutHome();
    const before = snapshot();
    const result = await prism(["install", "all"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("PRISM_IO_ERROR");
    expect(result.err).toContain(
      `Prism couldn't write ${join(home, ".codex/config.toml")} (the file is in use). All agent configs are back as they were. Close the app using it, then run the command again.`,
    );
    expect(tempFiles()).toEqual([]);
    expect(snapshot()).toEqual(before);
    expect(existsSync(join(home, ".prism/install.json"))).toBe(false);

    // The read-only bind goes away: the same command now works, and uninstall
    // puts the user's files back.
    inject.renameTo = null;
    expect((await prism(["install", "all"])).code).toBe(0);
    await prism(["uninstall"]);
    expect(snapshot()).toEqual(before);
  });

  it("a config that cannot be put back is recorded, and uninstall removes Prism's entry", async () => {
    scoutHome();
    rmSync(join(home, ".claude.json"));
    inject.rmPath = /\.claude\.json$/;
    const result = await prism(["install", "all"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain(
      [
        `Prism couldn't write ${join(home, ".codex/config.toml")} (the file is in use). These couldn't be put back:`,
        join(home, ".claude.json"),
        "Run prism uninstall to remove Prism's changes from them, then run the command again.",
      ].join("\n"),
    );
    expect(tempFiles()).toEqual([]);
    const record = JSON.parse(
      readFileSync(join(home, ".prism/install.json"), "utf8"),
    );
    expect(record.files).toEqual([
      expect.objectContaining({
        kind: "json-key",
        path: join(home, ".claude.json"),
        created: true,
      }),
    ]);

    inject.rmPath = null;
    inject.renameTo = null;
    const removed = await prism(["uninstall"]);
    expect(removed.out).toContain("Removed Prism from 1 place");
    expect(existsSync(join(home, ".claude.json"))).toBe(false);
  });

  it("an earlier install's record survives a failed re-install", async () => {
    mkdirSync(join(home, ".cursor"));
    expect((await prism(["install", "cursor"])).code).toBe(0);
    const record = readFileSync(join(home, ".prism/install.json"), "utf8");
    put(".codex/config.toml", 'model = "o3"\n');
    inject.renameTo = /\.codex[/\\]config\.toml$/;
    expect((await prism(["install", "codex"])).code).not.toBe(0);
    expect(readFileSync(join(home, ".prism/install.json"), "utf8")).toBe(
      record,
    );
    expect(readFileSync(join(home, ".codex/config.toml"), "utf8")).toBe(
      'model = "o3"\n',
    );
  });
});

describe("install failure wording (Muse, PR 10)", () => {
  it.each([
    [
      "EBUSY",
      "the file is in use",
      "Close the app using it, then run the command again.",
    ],
    [
      "EACCES",
      "permission denied",
      "Check the file's permissions, then run the command again.",
    ],
    [
      "EPERM",
      "permission denied",
      "Check the file's permissions, then run the command again.",
    ],
    [
      "ENOSPC",
      "the disk is full",
      "Free some space, then run the command again.",
    ],
    [
      "EROFS",
      "the file is read-only",
      "Make it writable, then run the command again.",
    ],
    ["EIO", "EIO", "Fix what's blocking the file, then run the command again."],
  ])("%s → (%s) + %s", async (code, reason, fix) => {
    expect(failureReason(code)).toEqual({ reason, fix });
    put(".codex/config.toml", 'model = "o3"\n');
    inject.renameTo = /\.codex[/\\]config\.toml$/;
    inject.renameCode = code;
    const result = await prism(["install", "codex"]);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain(
      `Prism couldn't write ${join(home, ".codex/config.toml")} (${reason}). All agent configs are back as they were. ${fix}`,
    );
  });

  it("something kept: each path on its own line, then the uninstall step", () => {
    expect(
      installFailureMessage("/h/.codex/config.toml", "ENOSPC", [
        "/h/a.json",
        "/h/b.json",
      ]),
    ).toBe(
      [
        "Prism couldn't write /h/.codex/config.toml (the disk is full). These couldn't be put back:",
        "/h/a.json",
        "/h/b.json",
        "Run prism uninstall to remove Prism's changes from them, then run the command again.",
      ].join("\n"),
    );
  });
});

/** `~/.prism-backups/<stamp>` folders made so far. */
function backupRoots(): string[] {
  const base = join(home, ".prism-backups");
  return existsSync(base)
    ? readdirSync(base).map((name) => join(base, name))
    : [];
}

const modeOf = (path: string) => statSync(path).mode & 0o777;

describe("backup before the first write (Arc review)", () => {
  it("copies each existing config to ~/.prism-backups/<UTC stamp>/configs/ (0600), records it, and says where", async () => {
    const claude = put(".claude.json", '{"numStartups":3}');
    const cursor = put(
      ".cursor/mcp.json",
      '{"mcpServers":{"other":{"command":"x"}}}',
    );
    const result = await prism(["install", "all"]);
    expect(result.code).toBe(0);
    const roots = backupRoots();
    expect(roots).toHaveLength(1);
    const root = roots[0]!;
    expect(root).toMatch(/[/\\]\.prism-backups[/\\]\d{8}T\d{6}$/);
    for (const [path, text] of [
      [claude, '{"numStartups":3}'],
      [cursor, '{"mcpServers":{"other":{"command":"x"}}}'],
    ] as const) {
      const copy = join(root, "configs", path.slice(home.length + 1));
      expect(readFileSync(copy, "utf8")).toBe(text);
      expect(modeOf(copy)).toBe(0o600);
    }
    // A file Prism creates has nothing to back up.
    expect(existsSync(join(root, "configs", ".claude/settings.json"))).toBe(
      false,
    );
    const record = JSON.parse(
      readFileSync(join(home, ".prism/install.json"), "utf8"),
    );
    expect(record.backupDir).toBe(root);
    expect(result.out).toContain(
      `Backups are in ~/.prism-backups/${root.split(/[/\\]/).pop()}/.`,
    );
  });

  it("nothing existing: no backup folder and no backup line", async () => {
    const result = await prism(["install", "cursor"]);
    expect(result.code).toBe(0);
    expect(backupRoots()).toEqual([]);
    expect(result.out).not.toContain("Backups are in");
  });

  it("the backup is on disk even if the process dies before the rollback", () => {
    const a = put(".claude.json", '{"numStartups":3}');
    const b = put(".codex/config.toml", 'model = "o3"\n');
    const base = join(home, ".prism-backups", "20261017T130000");
    // The run stops part-way and nothing calls rollBack: a crash.
    const crashed = withJournal(
      () => {
        atomicWrite(a, '{"numStartups":3,"mcpServers":{}}');
        atomicWrite(b, "half");
        throw new Error("killed");
      },
      { backup: { base, home } },
    );
    expect(crashed.error).toBeInstanceOf(Error);
    expect(crashed.backupRoot).toBe(base);
    expect(readFileSync(join(base, "configs/.claude.json"), "utf8")).toBe(
      '{"numStartups":3}',
    );
    expect(readFileSync(join(base, "configs/.codex/config.toml"), "utf8")).toBe(
      'model = "o3"\n',
    );
  });

  it("a failed install names the backup folder in the error data", async () => {
    put(".claude.json", '{"numStartups":3}');
    put(".codex/config.toml", 'model = "o3"\n');
    inject.renameTo = /\.codex[/\\]config\.toml$/;
    const result = await prism(["--json", "install", "all"]);
    expect(result.code).not.toBe(0);
    const root = backupRoots()[0]!;
    expect(`${result.out}${result.err}`).toContain(
      `"backupDir": ${JSON.stringify(root)}`,
    );
  });

  it("a second run never reuses the first run's folder", async () => {
    put(".claude.json", '{"numStartups":3}');
    expect((await prism(["install", "claude"])).code).toBe(0);
    put(".claude.json", '{"numStartups":4}');
    expect((await prism(["install", "claude"])).code).toBe(0);
    expect(new Set(backupRoots()).size).toBe(backupRoots().length);
  });
});

describe("file mode and no in-place writes (Arc review)", () => {
  it("a 0600 ~/.claude.json stays 0600 through install and uninstall", async () => {
    const claude = put(".claude.json", '{"numStartups":3}');
    chmodSync(claude, 0o600);
    expect((await prism(["install", "claude"])).code).toBe(0);
    expect(modeOf(claude)).toBe(0o600);
    expect((await prism(["uninstall"])).code).toBe(0);
    expect(modeOf(claude)).toBe(0o600);
    expect(readFileSync(claude, "utf8")).toBe('{"numStartups":3}');
  });

  it("rollback puts a 0600 config back at 0600, through a temp file and a rename, never in place", async () => {
    const claude = put(".claude.json", '{"numStartups":3}');
    chmodSync(claude, 0o600);
    const cursor = put(".cursor/mcp.json", '{"mcpServers":{}}');
    chmodSync(cursor, 0o640);
    put(".codex/config.toml", 'model = "o3"\n');
    inject.renameTo = /\.codex[/\\]config\.toml$/;
    inject.writes = [];
    const result = await prism(["install", "all"]);
    expect(result.code).not.toBe(0);
    expect(readFileSync(claude, "utf8")).toBe('{"numStartups":3}');
    expect(modeOf(claude)).toBe(0o600);
    expect(modeOf(cursor)).toBe(0o640);
    // Every write to an agent config, forward and rollback, went to a temp
    // file beside it; none wrote the config itself.
    const configWrites = inject.writes.filter(
      (path) => path.startsWith(home) && !path.startsWith(join(home, ".prism")),
    );
    expect(configWrites.length).toBeGreaterThan(0);
    for (const path of configWrites) expect(path).toMatch(/\.prism-\d+\.tmp$/);
    expect(tempFiles()).toEqual([]);
  });
});
