import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSkills } from "./doctor-skills.js";

function setup(skill: string, config?: object) {
  const repo = mkdtempSync(join(tmpdir(), "prism-skills-repo-"));
  const home = mkdtempSync(join(tmpdir(), "prism-skills-home-"));
  const prism = join(home, ".prism");
  mkdirSync(join(repo, ".claude", "skills", "mine"), { recursive: true });
  writeFileSync(join(repo, ".claude", "skills", "mine", "SKILL.md"), skill);
  if (config) {
    mkdirSync(prism, { recursive: true });
    writeFileSync(join(prism, "config.json"), JSON.stringify(config));
  }
  return { repo, env: { HOME: home, PRISM_HOME: prism } };
}

describe("prism doctor skills (plan §5.4)", () => {
  it("SK-7: a skill naming registered tools is OK", () => {
    const { repo, env } = setup(
      "Call `graph` (mode find) then `blast_radius`.",
    );
    const [finding] = checkSkills(repo, env);
    expect(finding).toMatchObject({ status: "ok", tools: ["blast_radius"] });
  });

  it("SK-8: a typo is an unknown tool with the file path and a suggestion", () => {
    const { repo, env } = setup("Call `blast_radus` on the file.");
    const [finding] = checkSkills(repo, env);
    expect(finding?.status).toBe("warn");
    expect(finding?.file).toBe(join(".claude", "skills", "mine", "SKILL.md"));
    expect(finding?.problems[0]).toMatch(
      /unknown tool blast_radus \(did you mean blast_radius\?\)/,
    );
  });

  it("review_with is on without extraTools", () => {
    const off = setup("Then `review_with` the lenses.");
    expect(checkSkills(off.repo, off.env)[0]?.status).toBe("ok");
    const on = setup("Then `review_with` the lenses.", {
      extraTools: ["review_with"],
    });
    expect(checkSkills(on.repo, on.env)[0]?.status).toBe("ok");
  });

  it("never reports a skill that names no Prism tool", () => {
    const { repo, env } = setup("Run `npm_test` and `git_status`.");
    expect(checkSkills(repo, env)).toEqual([]);
  });
});
