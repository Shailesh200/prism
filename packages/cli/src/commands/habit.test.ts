import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../program.js";

const dirs: string[] = [];
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

async function prism(argv: string[]) {
  let out = "";
  let err = "";
  const code = await run(argv, {
    cwd: process.env.HOME!,
    env: process.env,
    isTty: false,
    writer: {
      out: (t) => (out += t),
      err: (t) => (err += t),
    },
  });
  return { code, out, err };
}

describe("prism habit edit", () => {
  it("updates a long template without $EDITOR", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-habit-"));
    dirs.push(home);
    Object.assign(process.env, {
      HOME: home,
      PRISM_HOME: join(home, ".prism"),
      PRISM_DAEMON: "0",
    });
    delete process.env.EDITOR;
    delete process.env.VISUAL;
    const added = await prism([
      "habit",
      "add",
      "start my day",
      "--step",
      "github: list my open PRs",
      "--output",
      "standup",
    ]);
    expect(added.code).toBe(0);
    const template = "x".repeat(800);
    const edited = await prism([
      "habit",
      "edit",
      "start my day",
      "--template",
      template,
    ]);
    expect(edited.code).toBe(0);
    expect(edited.out).toContain('Saved habit "start my day"');
    const shown = await prism(["habit", "show", "start my day"]);
    expect(shown.out).toContain(template);
    const blocked = await prism(["habit", "edit", "start my day"]);
    expect(blocked.code).not.toBe(0);
    expect(`${blocked.out}\n${blocked.err}`).toContain("No $EDITOR is set");
    expect(`${blocked.out}\n${blocked.err}`).toContain("SKILL.md");
  });
});
