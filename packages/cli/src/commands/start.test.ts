import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../program.js";
import { daemonLaunch, realBin } from "./graph.js";
import { detectHosts } from "../install/hosts.js";
import {
  FIRST_ANSWER_FILE_CAP,
  firstAnswerCap,
  firstAnswerText,
  PARTIAL_LINE,
  TRY_LINE,
} from "./start.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** Every path under `dir` with its content (folders as "/"), sorted. */
function tree(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string, rel: string) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name);
      const key = rel ? `${rel}/${name}` : name;
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        out.push(`${key}/`);
        walk(path, key);
      } else out.push(`${key}=${readFileSync(path, "utf8")}`);
    }
  };
  walk(dir, "");
  return out;
}

/**
 * Sets `vars` on the real process.env for `fn`, then restores each key. Never
 * replaces process.env itself: os.homedir() reads the real environment, which
 * a plain-object process.env no longer reaches.
 */
async function withEnv<T>(
  vars: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T> {
  const before = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("prism start --dry-run never writes or indexes (J-25)", () => {
  for (const agents of [true, false])
    it(`leaves PRISM_HOME and the repo untouched (${agents ? "agents found" : "no agent found"})`, async () => {
      const root = mkdtempSync(join(tmpdir(), "prism-dry-repo-"));
      const home = mkdtempSync(join(tmpdir(), "prism-dry-home-"));
      dirs.push(root, home);
      mkdirSync(join(root, ".git"));
      writeFileSync(join(root, "package.json"), "{}");
      writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
      if (agents) {
        mkdirSync(join(home, ".cursor"));
        writeFileSync(join(home, ".cursor", "mcp.json"), '{"mcpServers":{}}\n');
      }
      const before = { home: tree(home), root: tree(root) };
      let out = "";
      const code = await withEnv(
        {
          HOME: home,
          USERPROFILE: home,
          PRISM_HOME: join(home, ".prism"),
          XDG_CONFIG_HOME: join(home, ".config"),
          PRISM_DAEMON: "0",
        },
        () =>
          run(["start", "--dry-run"], {
            cwd: root,
            env: process.env,
            isTty: false,
            writer: { out: (t) => (out += t), err: () => undefined },
          }),
      );
      // With agents, the dry run lists them: proof they were detected.
      if (agents) expect(out).toContain("~/.cursor/mcp.json");
      expect(code).toBe(0);
      expect(out.split("\n")[0]).toBe("Dry run: nothing will be written.");
      expect(out).not.toMatch(/Indexed \d+/);
      expect(existsSync(join(home, ".prism"))).toBe(false);
      expect({ home: tree(home), root: tree(root) }).toEqual(before);
    }, 30_000);
});

describe("prism start --yes backs up each agent config first (J-14)", () => {
  it("copies every existing config to ~/.prism-backups/<time>/ before changing it", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-yes-repo-"));
    const home = mkdtempSync(join(tmpdir(), "prism-yes-home-"));
    dirs.push(root, home);
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
    const cursor = `${JSON.stringify({ mcpServers: { mine: { command: "x" } } }, null, 2)}\n`;
    const claude = `${JSON.stringify({ theme: "dark" }, null, 2)}\n`;
    mkdirSync(join(home, ".cursor"));
    writeFileSync(join(home, ".cursor", "mcp.json"), cursor);
    mkdirSync(join(home, ".claude"));
    writeFileSync(join(home, ".claude", "settings.json"), claude);
    let out = "";
    const code = await withEnv(
      {
        HOME: home,
        USERPROFILE: home,
        PRISM_HOME: join(home, ".prism"),
        XDG_CONFIG_HOME: join(home, ".config"),
        PRISM_DAEMON: "0",
      },
      () =>
        run(["start", "--yes"], {
          cwd: root,
          env: process.env,
          isTty: false,
          writer: { out: (t) => (out += t), err: (t) => (out += t) },
        }),
    );
    expect(code, out).toBe(0);
    expect(existsSync(join(home, ".prism-backups")), out).toBe(true);
    const stamps = readdirSync(join(home, ".prism-backups"));
    expect(stamps).toHaveLength(1);
    const configs = join(home, ".prism-backups", stamps[0]!, "configs");
    // The backup holds each file as it was; the live file now has Prism.
    expect(readFileSync(join(configs, ".cursor", "mcp.json"), "utf8")).toBe(
      cursor,
    );
    expect(
      readFileSync(join(configs, ".claude", "settings.json"), "utf8"),
    ).toBe(claude);
    expect(readFileSync(join(home, ".cursor", "mcp.json"), "utf8")).toMatch(
      /"prism"/,
    );
    expect(
      readFileSync(join(home, ".claude", "settings.json"), "utf8"),
    ).not.toBe(claude);
  }, 30_000);
});

describe("prism start (P19)", () => {
  it("prints the file count, the map and what to try next", () => {
    const text = firstAnswerText({
      files: 5012,
      elapsedMs: 12_345,
      map: "packages/core  12 files",
      partial: false,
    });
    expect(text.split("\n")).toEqual([
      "Indexed 5012 code files in 12.3 s.",
      "",
      "packages/core  12 files",
      "",
      TRY_LINE,
    ]);
    expect(text).toMatch(/prism prepare/);
    // The agent does not call it on its own; the line must not promise that.
    expect(text).not.toMatch(/it calls prepare_change/);
    expect(text).not.toMatch(/health/i);
  });

  it("ONB-4 names a partial map when the first index was capped", () => {
    const text = firstAnswerText({
      files: 500,
      elapsedMs: 4_200,
      map: "packages/core  12 files",
      partial: true,
    });
    expect(text).toContain(PARTIAL_LINE);
    expect(text).toContain(TRY_LINE);
  });

  it("detects hosts from their user config folders", () => {
    const home = mkdtempSync(join(tmpdir(), "prism-start-"));
    dirs.push(home);
    expect(detectHosts(home)).toEqual([]);
    mkdirSync(join(home, ".cursor"));
    mkdirSync(join(home, ".config", "opencode"), { recursive: true });
    writeFileSync(join(home, ".claude.json"), "{}");
    expect(detectHosts(home)).toEqual(["claude", "cursor", "opencode"]);
  });

  it("a note replaces the background line when the daemon did not take the index", () => {
    const text = firstAnswerText(
      { files: 500, elapsedMs: 1_000, map: "m", partial: true },
      "Partial map (top packages first). Run `prism index` to finish the full index (the daemon is off).",
    );
    expect(text).toContain("daemon is off");
    expect(text).not.toContain(PARTIAL_LINE);
  });

  // Indexes a 500-file repo twice (about 3 s alone); the default 5 s is too
  // tight when every package runs its tests at once.
  it("start and bare prism print the same answer in the same order, daemon off", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-start-repo-"));
    const home = mkdtempSync(join(tmpdir(), "prism-start-home-"));
    dirs.push(root, home);
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, "README.md"), "# demo\n");
    for (let i = 0; i < 502; i += 1)
      writeFileSync(join(root, `f${i}.ts`), `export const v${i} = ${i};\n`);
    const saved = { ...process.env };
    Object.assign(process.env, {
      HOME: home,
      PRISM_HOME: join(home, ".prism"),
      PRISM_DAEMON: "0",
      // The real cap is 5,000; a small one keeps this fixture small.
      PRISM_START_FILE_CAP: "500",
    });
    const outputs: string[] = [];
    try {
      for (const argv of [["start"], []]) {
        let out = "";
        const code = await run(argv, {
          cwd: root,
          env: process.env,
          isTty: false,
          writer: { out: (t) => (out += t), err: () => undefined },
        });
        expect(code).toBe(0);
        outputs.push(out);
      }
    } finally {
      process.env = saved;
    }
    const [start = "", bare = ""] = outputs;
    // No agents in this HOME: start adds one line, then the same answer.
    expect(start.split("\n")[0]).toMatch(/^No coding agent found/);
    const answer = (text: string) =>
      text
        .slice(text.indexOf("Indexed "))
        .replace(/in [\d.]+ s/, "")
        .replace(/# key \w+/, "");
    expect(answer(start)).toBe(answer(bare));
    expect(bare).toMatch(/^Indexed 500 code files/);
    expect(bare).toContain("daemon is off");
    expect(bare).not.toContain("finishing in the background");
  }, 30_000);

  it("the first-answer cap is 5,000 unless PRISM_START_FILE_CAP says otherwise", () => {
    expect(FIRST_ANSWER_FILE_CAP).toBe(5000);
    expect(firstAnswerCap({})).toBe(5000);
    expect(firstAnswerCap({ PRISM_START_FILE_CAP: "500" })).toBe(500);
    expect(firstAnswerCap({ PRISM_START_FILE_CAP: "0" })).toBe(0);
    expect(firstAnswerCap({ PRISM_START_FILE_CAP: "lots" })).toBe(5000);
  });

  it("the daemon launch carries this build's id, so a stale daemon is replaced", () => {
    const launch = daemonLaunch({ ...process.env, PRISM_MCP_BIN: "" });
    expect(typeof launch === "string" ? launch : launch.buildId).toMatch(
      /^\d+\.\d+\.\d+.*\+\d+$/,
    );
  });
});

describe("daemon launch through a PATH symlink (round 4 fresh-copy QA)", () => {
  it("follows prism-mcp to the server's bin.js and keeps the build id", () => {
    const bin = mkdtempSync(join(tmpdir(), "prism-bin-"));
    dirs.push(bin);
    const target = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../mcp-server/dist/bin.js",
    );
    symlinkSync(target, join(bin, "prism-mcp"));
    expect(realBin(join(bin, "prism-mcp"))).toBe(realpathSync(target));
    const launch = daemonLaunch({
      ...process.env,
      PRISM_MCP_BIN: "",
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    });
    if (typeof launch === "string") throw new Error(launch);
    expect(launch.command).toBe(process.execPath);
    expect(launch.args[0]).toBe(realpathSync(target));
    expect(launch.buildId).toMatch(/^\d+\.\d+\.\d+.*\+\d+$/);
  });
});
