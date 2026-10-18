import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadUserConfigSync,
  resolveStrength,
  setStrength,
  STRENGTHS,
} from "./user-config.js";

function fresh() {
  const home = mkdtempSync(join(tmpdir(), "prism-strength-home-"));
  const root = mkdtempSync(join(tmpdir(), "prism-strength-repo-"));
  return { env: { PRISM_HOME: home } as NodeJS.ProcessEnv, home, root };
}

describe("strength (plan P5)", () => {
  it("defaults to full", () => {
    const { env, root } = fresh();
    expect(resolveStrength(root, env)).toEqual({
      ok: true,
      value: { strength: "full", source: "default" },
    });
  });

  it("STR-1 each level is written to the user config and read back, other keys kept", () => {
    const { env, home, root } = fresh();
    writeFileSync(
      join(home, "config.json"),
      JSON.stringify({ extraTools: ["receipt"] }),
    );
    for (const level of STRENGTHS) {
      expect(setStrength(level, { scope: "user" }, env).ok).toBe(true);
      expect(resolveStrength(root, env)).toMatchObject({
        ok: true,
        value: { strength: level, source: "user" },
      });
    }
    expect(loadUserConfigSync(env)).toMatchObject({
      ok: true,
      value: { extraTools: ["receipt"], strength: "off" },
    });
  });

  it("STR-4 a repository override wins and keeps the repo's index knobs", () => {
    const { env, root } = fresh();
    setStrength("off", { scope: "user" }, env);
    mkdirSync(join(root, ".prism"));
    writeFileSync(
      join(root, ".prism", "config.json"),
      JSON.stringify({ excludeGlobs: ["gen/**"] }),
    );
    expect(setStrength("lite", { scope: "repo", root }, env).ok).toBe(true);
    expect(resolveStrength(root, env)).toMatchObject({
      ok: true,
      value: { strength: "lite", source: "repo" },
    });
    expect(
      JSON.parse(readFileSync(join(root, ".prism", "config.json"), "utf8")),
    ).toEqual({
      excludeGlobs: ["gen/**"],
      strength: "lite",
    });
  });

  it("an invalid config is an error, never silently 'full'", () => {
    const { env, home, root } = fresh();
    writeFileSync(join(home, "config.json"), "{torn");
    expect(resolveStrength(root, env).ok).toBe(false);
    expect(setStrength("lite", { scope: "user" }, env).ok).toBe(false);
  });
});
