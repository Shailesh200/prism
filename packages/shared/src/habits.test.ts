import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addHabit,
  findHabit,
  findSecret,
  habitInstructions,
  habitSkillMarkdown,
  habitsDir,
  legacyHabitsPath,
  parseHabitSkill,
  readHabits,
  removeHabit,
  replaceHabit,
  type Habit,
} from "./habits.js";

let env: NodeJS.ProcessEnv;
beforeEach(async () => {
  env = { PRISM_HOME: await mkdtemp(join(tmpdir(), "prism-habits-")) };
});

const startMyDay: Habit = {
  name: "start my day",
  description: "Morning standup prep",
  steps: [
    {
      source: "github",
      action: "list my open PRs and review requests",
      filter: "repo:Shailesh200/prism",
    },
    { source: "linear", action: "list my in-progress and todo issues" },
    { source: "notion", action: "read page 'Daily notes' for today" },
  ],
  output: {
    format: "standup",
    template: "Yesterday / Today / Blockers, ≤ 10 bullets",
  },
};

describe("habits store", () => {
  it("HAB-1: add, list, show, remove round-trip", async () => {
    expect((await addHabit(startMyDay, env)).ok).toBe(true);
    const file = await readHabits(env);
    expect(file.ok && file.value.habits.map((h) => h.name)).toEqual([
      "start my day",
    ]);
    expect(
      file.ok && findHabit(file.value.habits, "start my day"),
    ).toMatchObject({ kind: "found" });
    expect((await removeHabit("Start My Day", env)).ok).toBe(true);
    const after = await readHabits(env);
    expect(after.ok && after.value.habits).toEqual([]);
  });

  it("HAB-2: edit re-validates", async () => {
    await addHabit(startMyDay, env);
    const bad = await replaceHabit(
      "start my day",
      { ...startMyDay, steps: [] },
      env,
    );
    expect(bad.ok).toBe(false);
    const good = await replaceHabit(
      "start my day",
      { ...startMyDay, description: "new" },
      env,
    );
    expect(good.ok && good.value.description).toBe("new");
  });

  it("accepts a template longer than 500 characters", async () => {
    const template = "x".repeat(800);
    const added = await addHabit(
      { ...startMyDay, output: { format: "free", template } },
      env,
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.output.template).toBe(template);
  });

  it("HAB-3: duplicate name (case/space-insensitive) rejected", async () => {
    await addHabit(startMyDay, env);
    const dup = await addHabit({ ...startMyDay, name: "Start  My_Day" }, env);
    expect(dup.ok).toBe(false);
  });

  it("HAB-4: secrets rejected without echoing them", async () => {
    const samples = [
      "sk-ant-abcdefghijklmnopqrstuv1234",
      "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "xoxb-1234567890-abcdefghij",
      "lin_api_abcdefghijklmnopqrstuvwxyz12",
      "secret_abcdefghijklmnopqrstuvwxyz1234",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N",
      "Authorization: Bearer abcdef1234567890xyz",
      "https://user:hunter2@example.com/api",
      "0123456789abcdef0123456789abcdef01234567",
      "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCd",
    ];
    for (const secret of samples) {
      const res = await addHabit(
        {
          ...startMyDay,
          steps: [{ source: "github", action: `use ${secret}` }],
        },
        env,
      );
      expect(res.ok, secret).toBe(false);
      if (!res.ok) expect(res.error.message).not.toContain(secret);
    }
    // Ordinary text and Notion-style slugs are fine.
    expect(
      findSecret("read page Daily-notes-0123456789abcdef0123456789abcdef"),
    ).toBeUndefined();
    expect(findSecret("list my open PRs and review requests")).toBeUndefined();
  });

  it("HAB-5: each habit is a SKILL.md with mode 0600", async () => {
    await addHabit(startMyDay, env);
    const path = join(habitsDir(env), "start-my-day", "SKILL.md");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const text = await readFile(path, "utf8");
    expect(text).toMatch(/^---\nname: start-my-day\ndescription: "Habit: /);
    expect(text).toContain(
      "1. github: list my open PRs and review requests | repo:Shailesh200/prism",
    );
    expect(text).toContain(
      "## Output\n\nstandup: Yesterday / Today / Blockers, ≤ 10 bullets",
    );
  });

  it("HAB-7: instructions keep step order and output", () => {
    const out = habitInstructions(startMyDay);
    expect(out.steps.map((s) => s.source)).toEqual([
      "github",
      "linear",
      "notion",
    ]);
    expect(out.steps[0]?.filter).toBe("repo:Shailesh200/prism");
    expect(out.output.format).toBe("standup");
    expect(out.preamble).toMatch(/connected tools/);
  });

  it("a shell step is a known source; an unknown label gets a note", () => {
    const out = habitInstructions({
      ...startMyDay,
      steps: [
        { source: "shell", action: "run git status" },
        { source: "fax", action: "send it" },
      ],
    });
    expect(out.steps[0]).not.toHaveProperty("note");
    expect(out.steps[1]?.note).toMatch(/unknown source label/);
  });

  it("HAB-8/9: fuzzy match, unknown name lists near names", () => {
    const habits = [
      startMyDay,
      { ...startMyDay, name: "end my day" },
      { ...startMyDay, name: "review queue" },
    ];
    expect(findHabit(habits, "startmyday")).toMatchObject({
      kind: "found",
      habit: { name: "start my day" },
    });
    expect(findHabit(habits, "review")).toMatchObject({
      kind: "found",
      habit: { name: "review queue" },
    });
    const miss = findHabit(habits, "my week");
    expect(miss.kind).toBe("missing");
    if (miss.kind === "missing")
      expect(miss.near).toEqual(["start my day", "end my day"]);
  });

  it("HAB-11: events log has the name and step count, never step text", async () => {
    await addHabit(startMyDay, env);
    const log = await readFile(join(env.PRISM_HOME!, "events.jsonl"), "utf8");
    expect(log).toContain("habit.add");
    expect(log).not.toContain("review requests");
  });

  it("rejects a corrupt old store instead of overwriting it", async () => {
    await writeFile(legacyHabitsPath(env), "{not json");
    expect((await addHabit(startMyDay, env)).ok).toBe(false);
    expect(await readFile(legacyHabitsPath(env), "utf8")).toBe("{not json");
  });
});

describe("habits as skills", () => {
  it("a SKILL.md round-trips; other skills are not habits", () => {
    const back = parseHabitSkill(habitSkillMarkdown(startMyDay));
    expect(back?.ok && back.value).toEqual(startMyDay);
    expect(
      parseHabitSkill("---\nname: x\ndescription: y\n---\n\n# X\n"),
    ).toBeUndefined();
  });

  it("a hand-edited secret is refused on read", () => {
    const text = habitSkillMarkdown(startMyDay).replace(
      "list my in-progress",
      "use ghp_abcdefghijklmnopqrstuvwxyz0123456789 to list my in-progress",
    );
    const back = parseHabitSkill(text);
    expect(back?.ok).toBe(false);
    if (back && !back.ok) expect(back.error.message).not.toContain("ghp_");
  });

  it("a multi-line field is refused (the layout is one line per field)", async () => {
    const res = await addHabit({ ...startMyDay, description: "one\ntwo" }, env);
    expect(res.ok).toBe(false);
  });

  it("migrates habits.json once, keeps a backup, removes the old store", async () => {
    await writeFile(
      legacyHabitsPath(env),
      JSON.stringify({ version: 1, habits: [startMyDay] }),
    );
    const first = await readHabits(env);
    expect(first.ok && first.value.habits).toEqual([startMyDay]);
    expect(existsSync(legacyHabitsPath(env))).toBe(false);
    const backups = (await readdir(env.PRISM_HOME!)).filter((f) =>
      f.startsWith("habits.json.migrated-"),
    );
    expect(backups).toHaveLength(1);
    // Idempotent: a stale copy of the old store adds nothing twice.
    await writeFile(
      legacyHabitsPath(env),
      JSON.stringify({ version: 1, habits: [startMyDay] }),
    );
    const again = await readHabits(env);
    expect(again.ok && again.value.habits).toEqual([startMyDay]);
  });

  it("a habit name that clashes with another skill folder is refused", async () => {
    await mkdir(join(habitsDir(env), "start-my-day"), { recursive: true });
    await writeFile(
      join(habitsDir(env), "start-my-day", "SKILL.md"),
      "---\nname: start-my-day\ndescription: mine\n---\n",
    );
    expect((await addHabit(startMyDay, env)).ok).toBe(false);
  });
});
