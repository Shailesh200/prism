/**
 * PR 10, install safety: no data loss.
 * J-16: uninstall takes back only Prism's entry; a file or key the user had
 * stays byte-for-byte, a file Prism created goes.
 * J-15: a write that fails part-way puts every config back, leaves no temp
 * file, and records whatever could not be put back so uninstall finds it.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
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
}));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    renameSync: (from: string, to: string) => {
      if (inject.renameTo?.test(String(to))) {
        throw Object.assign(
          new Error(`EBUSY: resource busy or locked, rename '${from}' -> '${to}'`),
          { code: "EBUSY", syscall: "rename", path: from, dest: to },
        );
      }
      return real.renameSync(from, to);
    },
    rmSync: (path: string, options?: import("node:fs").RmOptions) => {
      if (inject.rmPath?.test(String(path))) {
        throw Object.assign(new Error(`EPERM: operation not permitted, unlink '${path}'`), {
          code: "EPERM",
          path,
        });
      }
      return real.rmSync(path, options);
    },
  };
});

const { run } = await import("../program.js");

// Set and restore keys in place: replacing `process.env` would detach it
// from the real environment, and `os.homedir()` would stop seeing HOME.
const KEYS = ["HOME", "PRISM_HOME", "PRISM_DAEMON", "PRISM_HOOK_REFRESH"] as const;
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
    const userHooks = put(
      ".claude/../.claude/settings.local.json",
      "{}\n",
    );
    const before = snapshot();
    expect((await prism(["install", "claude"])).code).toBe(0);
    expect(readFileSync(settings, "utf8")).toContain('"hooks"');
    await prism(["uninstall"]);
    expect(readFileSync(claudeJson, "utf8")).toBe(before.get("/.claude.json"));
    expect(readFileSync(settings, "utf8")).toBe(before.get("/.claude/settings.json"));
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
    const record = JSON.parse(readFileSync(join(home, ".prism/install.json"), "utf8"));
    const entry = record.files.find((f: { path: string }) => f.path.endsWith("mcp.json"));
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
    expect(result.err).toContain(".codex/config.toml (EBUSY)");
    expect(result.err).toContain("Every agent config was put back as it was");
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
    expect(result.err).toContain("could not be put back");
    expect(tempFiles()).toEqual([]);
    const record = JSON.parse(readFileSync(join(home, ".prism/install.json"), "utf8"));
    expect(record.files).toEqual([
      expect.objectContaining({ kind: "json-key", path: join(home, ".claude.json"), created: true }),
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
    expect(readFileSync(join(home, ".prism/install.json"), "utf8")).toBe(record);
    expect(readFileSync(join(home, ".codex/config.toml"), "utf8")).toBe('model = "o3"\n');
  });
});
