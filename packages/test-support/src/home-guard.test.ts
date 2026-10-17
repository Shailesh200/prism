import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  changedConfigs,
  configTimes,
  homeProblem,
  isInside,
} from "./home-guard.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** A fake temp root and a fake real home, both real folders. */
function machine() {
  const root = mkdtempSync(join(tmpdir(), "prism-guard-"));
  dirs.push(root);
  const temp = join(root, "tmp");
  const realHome = join(root, "Users", "someone");
  mkdirSync(temp, { recursive: true });
  mkdirSync(realHome, { recursive: true });
  const dir = mkdtempSync(join(temp, "run-"));
  return { temp, realHome, dir };
}

describe("home guard", () => {
  it("accepts HOME and PRISM_HOME inside the temp folder", () => {
    const m = machine();
    expect(
      homeProblem(
        {
          HOME: m.dir,
          PRISM_HOME: join(m.dir, ".prism"),
          XDG_CONFIG_HOME: join(m.dir, ".config"),
        },
        m.realHome,
        m.temp,
      ),
    ).toBeUndefined();
  });

  it("rejects the real home and anything inside it", () => {
    const m = machine();
    expect(
      homeProblem(
        { HOME: m.realHome, PRISM_HOME: join(m.dir, ".prism") },
        m.realHome,
        m.temp,
      ),
    ).toMatch(/HOME=.*real home/);
    expect(
      homeProblem(
        { HOME: m.dir, PRISM_HOME: join(m.realHome, ".prism") },
        m.realHome,
        m.temp,
      ),
    ).toMatch(/PRISM_HOME=.*real home/);
  });

  it("rejects a symlink in the temp folder that points into the real home", () => {
    const m = machine();
    const link = join(m.temp, "looks-safe");
    symlinkSync(m.realHome, link);
    expect(
      homeProblem(
        { HOME: link, PRISM_HOME: join(m.dir, ".prism") },
        m.realHome,
        m.temp,
      ),
    ).toMatch(/HOME=.*real home/);
  });

  it("rejects an unset HOME or PRISM_HOME", () => {
    const m = machine();
    expect(
      homeProblem({ PRISM_HOME: join(m.dir, ".prism") }, m.realHome, m.temp),
    ).toMatch(/HOME is unset/);
    expect(homeProblem({ HOME: m.dir }, m.realHome, m.temp)).toMatch(
      /PRISM_HOME is unset/,
    );
  });

  it("rejects a HOME or PRISM_HOME outside the temp folder", () => {
    const m = machine();
    const outside = join(m.realHome, "..", "elsewhere");
    expect(
      homeProblem(
        { HOME: outside, PRISM_HOME: join(m.dir, ".prism") },
        m.realHome,
        m.temp,
      ),
    ).toMatch(/HOME=.*not inside the temp folder/);
    expect(
      homeProblem({ HOME: m.dir, PRISM_HOME: outside }, m.realHome, m.temp),
    ).toMatch(/PRISM_HOME=.*not inside the temp folder/);
  });

  it("rejects an XDG_CONFIG_HOME in the real home", () => {
    const m = machine();
    expect(
      homeProblem(
        {
          HOME: m.dir,
          PRISM_HOME: join(m.dir, ".prism"),
          XDG_CONFIG_HOME: join(m.realHome, ".config"),
        },
        m.realHome,
        m.temp,
      ),
    ).toMatch(/XDG_CONFIG_HOME/);
  });

  it("notices a changed agent config by its modification time only", () => {
    const m = machine();
    const before = configTimes(m.dir);
    writeFileSync(join(m.dir, ".claude.json"), "{}");
    expect(changedConfigs(before, configTimes(m.dir))).toEqual([
      ".claude.json",
    ]);
    expect(isInside(join(m.dir, "not-yet"), m.dir)).toBe(true);
  });

  it("this run itself is isolated", () => {
    expect(homeProblem()).toBeUndefined();
  });
});
