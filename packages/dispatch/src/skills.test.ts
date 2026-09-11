import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CURRENT_SKILL_VERSION,
  applyGeneratedSkill,
  deleteSkill,
  deleteSkillVersion,
  duplicateSkill,
  listSkillVersions,
  listSkills,
  nameForDuplicate,
  readSkill,
  revertSkillVersion,
  skillDraftFromMarkdown,
  skillNameFromJobTitle,
  unwrapSkillMarkdown,
  writeSkill,
} from "./skills.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("Prism skills library", () => {
  it("ships inherited skills and stores user drafts under PRISM_HOME", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-skills-"));
    temps.push(home);
    const env = { PRISM_HOME: home };
    const listed = await listSkills(env);
    expect(listed.map((row) => row.name)).toContain("prism-safe-change");
    const saved = await writeSkill(
      {
        name: "Commit Push",
        description: "When they ask to commit the job files.",
        body: "Never git add -A.",
        status: "draft",
      },
      env,
    );
    expect("error" in saved).toBe(false);
    if ("error" in saved) return;
    expect(saved.name).toBe("commit-push");
    const got = await readSkill("commit-push", env);
    expect(got?.status).toBe("draft");
    expect(got?.body).toMatch(/Never git add -A/);
    expect(await deleteSkill("commit-push", env)).toBe(true);
    expect(await readSkill("commit-push", env)).toBeUndefined();
  });

  it("duplicates an inherited skill into Yours without colliding", async () => {
    expect(nameForDuplicate("prism-safe-change", ["prism-safe-change"])).toBe(
      "safe-change",
    );
    expect(
      nameForDuplicate("prism-safe-change", [
        "prism-safe-change",
        "safe-change",
      ]),
    ).toBe("safe-change-2");
    const home = await mkdtemp(join(tmpdir(), "prism-skills-dup-"));
    temps.push(home);
    const env = { PRISM_HOME: home };
    const copied = await duplicateSkill("prism-safe-change", env);
    expect("error" in copied).toBe(false);
    if ("error" in copied) return;
    expect(copied).toMatchObject({
      name: "safe-change",
      inherited: false,
      status: "draft",
    });
    expect(copied.body).toContain("blast_radius");
    const again = await duplicateSkill("prism-safe-change", env);
    expect("error" in again).toBe(false);
    if ("error" in again) return;
    expect(again.name).toBe("safe-change-2");
  });

  it("refuses to overwrite an inherited skill", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-skills-"));
    temps.push(home);
    const result = await writeSkill(
      {
        name: "prism-safe-change",
        description: "x",
        body: "y",
        status: "published",
      },
      { PRISM_HOME: home },
    );
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("renames a draft instead of leaving the old name on disk", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-skills-rename-"));
    temps.push(home);
    const env = { PRISM_HOME: home };
    await writeSkill(
      {
        name: "alpha",
        description: "first",
        body: "body",
        status: "draft",
      },
      env,
    );
    const renamed = await writeSkill(
      {
        name: "beta",
        description: "first",
        body: "body",
        status: "draft",
        previousName: "alpha",
      },
      env,
    );
    expect("error" in renamed).toBe(false);
    expect(await readSkill("alpha", env)).toBeUndefined();
    expect((await readSkill("beta", env))?.name).toBe("beta");
  });

  it("snapshots each change and can revert or delete a version", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-skills-hist-"));
    temps.push(home);
    const env = { PRISM_HOME: home };
    await writeSkill(
      {
        name: "commitpush",
        description: "first",
        body: "step one",
        status: "draft",
      },
      env,
    );
    await writeSkill(
      {
        name: "commitpush",
        description: "second",
        body: "step two",
        status: "published",
      },
      env,
    );
    const listed = await listSkillVersions("commitpush", env);
    expect("error" in listed).toBe(false);
    if ("error" in listed) return;
    expect(listed[0]).toMatchObject({
      id: CURRENT_SKILL_VERSION,
      current: true,
      body: "step two",
    });
    expect(listed[1]?.body).toBe("step one");
    const historicId = listed[1]?.id;
    expect(historicId).toBeTruthy();
    if (!historicId) return;
    const reverted = await revertSkillVersion("commitpush", historicId, env);
    expect("error" in reverted).toBe(false);
    expect((await readSkill("commitpush", env))?.body).toBe("step one");
    const afterRevert = await listSkillVersions("commitpush", env);
    expect("error" in afterRevert).toBe(false);
    if ("error" in afterRevert) return;
    const extra = afterRevert.find((row) => row.body === "step two");
    expect(extra?.current).toBe(false);
    if (!extra) return;
    const removed = await deleteSkillVersion("commitpush", extra.id, env);
    expect(removed.ok).toBe(true);
    const remaining = await listSkillVersions("commitpush", env);
    expect("error" in remaining).toBe(false);
    if ("error" in remaining) return;
    expect(remaining.some((row) => row.id === extra.id)).toBe(false);
    expect(
      (await deleteSkillVersion("commitpush", CURRENT_SKILL_VERSION, env)).ok,
    ).toBe(false);
  });
});

describe("use_skill tool", () => {
  it("lists and loads Prism skills", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-use-skill-"));
    temps.push(home);
    const { createDispatchRuntime } = await import("./runtime.js");
    const runtime = createDispatchRuntime({
      workspaceRoot: home,
      env: { PRISM_HOME: home },
    });
    const listed = (await runtime.handle("use_skill", {})) as {
      message: string;
    };
    expect(listed.message).toContain("prism-safe-change");
    const loaded = (await runtime.handle("use_skill", {
      name: "prism-review-pr",
    })) as { message: string };
    expect(loaded.message).toContain("review_changes");
  });
});

describe("applyGeneratedSkill", () => {
  it("reads the skill name from a Skill: job title", () => {
    expect(skillNameFromJobTitle("Skill: commitpush")).toBe("commitpush");
    expect(skillNameFromJobTitle("skill: commit-push — draft")).toBe(
      "commit-push",
    );
    expect(skillNameFromJobTitle("Fix login")).toBeUndefined();
  });

  it("unwraps a fenced SKILL.md and keeps an existing draft status", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-skill-apply-"));
    temps.push(home);
    const env = { PRISM_HOME: home };
    await writeSkill(
      {
        name: "commitpush",
        description: "old when",
        body: "old workflow",
        status: "draft",
      },
      env,
    );
    const markdown = [
      "Here is the skill:",
      "",
      "```markdown",
      "---",
      'description: "Ship the job files."',
      "status: published",
      "---",
      "",
      "Never git add -A.",
      "1. Stage the job files.",
      "```",
    ].join("\n");
    expect(unwrapSkillMarkdown(markdown)).toContain("Never git add -A");
    expect(skillDraftFromMarkdown("commitpush", markdown).description).toBe(
      "Ship the job files.",
    );
    const saved = await applyGeneratedSkill({
      title: "Skill: commitpush",
      assistant: markdown,
      env,
    });
    expect(saved?.body).toContain("Never git add -A");
    expect(saved?.description).toBe("Ship the job files.");
    expect(saved?.status).toBe("draft");
    const got = await readSkill("commitpush", env);
    expect(got?.body).toContain("Stage the job files");
  });

  it("does not overwrite an inherited skill", async () => {
    const home = await mkdtemp(join(tmpdir(), "prism-skill-inherit-"));
    temps.push(home);
    const saved = await applyGeneratedSkill({
      title: "Skill: prism-safe-change",
      assistant: "# nope\n\nShould not land.",
      env: { PRISM_HOME: home },
    });
    expect(saved).toBeUndefined();
  });
});
