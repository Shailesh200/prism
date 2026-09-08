import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteSkill,
  duplicateSkill,
  listSkills,
  nameForDuplicate,
  readSkill,
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
