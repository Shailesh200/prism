/** PR 10: a visible update notice in `prism start`, `prism doctor` and `prism upgrade`. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { ok } from "@repo-prism/shared";
import type { checkForUpdate } from "@repo-prism/shared/update-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { upgradeWith } from "./commands/install.js";
import { run } from "./program.js";
import type { CommandContext } from "./runtime.js";
import { cliBuild, cliUpdateLine, withUpdateLine } from "./update-line.js";

const LINE = "Prism 2.0.1 is out. To update, run: npm i -g @repo-prism/cli@latest";
const npm = { version: "2.0.0", fromNpm: true } as const;
const answer =
  (outcome: Awaited<ReturnType<typeof checkForUpdate>>): typeof checkForUpdate =>
  async () =>
    outcome;
const available = answer({ kind: "available", latest: "2.0.1", cached: true });
const current = answer({ kind: "current", latest: "2.0.0", cached: true });
const offline = answer({ kind: "unknown", reason: "fetch failed" });

const KEYS = ["HOME", "PRISM_HOME", "PRISM_DAEMON"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let home = "";
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "prism-update-cli-"));
  process.env.HOME = home;
  process.env.PRISM_HOME = join(home, ".prism");
  process.env.PRISM_DAEMON = "0";
  expect(homedir()).toBe(home);
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  rmSync(home, { recursive: true, force: true });
});

const context = {} as CommandContext;
const fake = withUpdateLine;
const handler = async () => ok({ data: { a: 1 }, human: () => "Prism is set up." });
const boom: typeof checkForUpdate = async () => {
  throw new Error("boom");
};

describe("start / doctor notice", () => {
  it("adds the line last when npm has a newer Prism; nothing otherwise", async () => {
    const shown = await fake(handler, { build: npm, check: available })(context);
    expect(shown.ok && shown.value.human({ json: false } as never)).toBe(
      `Prism is set up.\n\n${LINE}`,
    );
    expect(shown.ok && shown.value.data).toEqual({ a: 1 });
    for (const check of [current, offline]) {
      const quiet = await fake(handler, { build: npm, check })(context);
      expect(quiet.ok && quiet.value.human({} as never)).toBe("Prism is set up.");
    }
  });

  it("a checkout never checks; a failing check never breaks the command", async () => {
    let called = false;
    const spy: typeof checkForUpdate = async () => {
      called = true;
      return { kind: "available", latest: "9.0.0", cached: false };
    };
    expect(
      await cliUpdateLine({ build: { version: "2.0.0", fromNpm: false }, check: spy }),
    ).toBeUndefined();
    expect(called).toBe(false);
    expect(await cliUpdateLine({ build: npm, check: boom })).toBeUndefined();
    expect(cliBuild().fromNpm).toBe(false);
  });
});

describe("prism upgrade says what is new (it downloads nothing)", () => {
  async function installed() {
    mkdirSync(join(home, ".cursor"));
    let out = "";
    const code = await run(["install", "cursor"], {
      cwd: home,
      env: process.env,
      isTty: false,
      writer: { out: (t) => (out += t), err: () => undefined },
    });
    expect(code).toBe(0);
    return readFileSync(join(home, ".prism", "install.json"), "utf8");
  }

  it("newer on npm: prints the npm command and changes nothing", async () => {
    const record = await installed();
    const config = readFileSync(join(home, ".cursor", "mcp.json"), "utf8");
    const result = await upgradeWith({ build: npm, check: available })(context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.human({} as never)).toBe(LINE);
    expect(result.value.data).toMatchObject({ latest: "2.0.1", updated: false });
    expect(readFileSync(join(home, ".prism", "install.json"), "utf8")).toBe(record);
    expect(readFileSync(join(home, ".cursor", "mcp.json"), "utf8")).toBe(config);
  });

  it("nothing new: `Prism is up to date (<version>).`", async () => {
    const record = await installed();
    const version = JSON.parse(record).version as string;
    const result = await upgradeWith({ build: npm, check: current })(context);
    expect(result.ok && result.value.human({} as never)).toBe(
      `Prism is up to date (${version}).`,
    );
    expect(readFileSync(join(home, ".prism", "install.json"), "utf8")).toBe(record);
  });

  it("npm unreachable: says so and names the command", async () => {
    await installed();
    const result = await upgradeWith({ build: npm, check: offline })(context);
    expect(result.ok && result.value.human({} as never)).toContain(
      "couldn't reach npm",
    );
    expect(result.ok && result.value.human({} as never)).toContain(
      "npm i -g @repo-prism/cli@latest",
    );
  });
});
