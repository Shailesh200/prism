import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addHabit } from "@repo-prism/shared/habits";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../tool-registry.js";
import { habits } from "./habits.js";

const context = {} as ToolContext;
let previous: string | undefined;

beforeEach(async () => {
  previous = process.env.PRISM_HOME;
  process.env.PRISM_HOME = await mkdtemp(join(tmpdir(), "prism-habits-tool-"));
});
afterEach(() => {
  if (previous === undefined) delete process.env.PRISM_HOME;
  else process.env.PRISM_HOME = previous;
});

describe("habits tool", () => {
  it("HAB-6: no name lists habits (and hints when there are none)", async () => {
    const empty = await habits.call(context, {});
    expect(empty.ok && (empty.value as { hint?: string }).hint).toMatch(
      /prism habit add/,
    );
    await addHabit({
      name: "start my day",
      steps: [{ source: "github", action: "list my open PRs" }],
      output: { format: "standup" },
    });
    const listed = await habits.call(context, {});
    expect(listed.ok && listed.value).toEqual({
      habits: [{ name: "start my day", steps: 1 }],
    });
  });

  it("HAB-7/8/9: returns ordered steps by fuzzy name; unknown names get near matches", async () => {
    await addHabit({
      name: "start my day",
      steps: [
        { source: "github", action: "list my open PRs" },
        { source: "linear", action: "list my issues" },
      ],
      output: { format: "standup", template: "Yesterday / Today / Blockers" },
    });
    const run = await habits.call(context, { name: "Start My Day" });
    expect(run.ok).toBe(true);
    const value = run.ok
      ? (run.value as { steps: { n: number; source: string }[] })
      : null;
    expect(value?.steps.map((s) => `${s.n}:${s.source}`)).toEqual([
      "1:github",
      "2:linear",
    ]);
    expect(JSON.stringify(run.ok && run.value).length / 4).toBeLessThan(600);
    const miss = await habits.call(context, { name: "end my day" });
    expect(miss.ok && miss.value).toMatchObject({
      found: false,
      near: ["start my day"],
    });
  });

  it("serves a habit migrated from the old habits.json", async () => {
    await writeFile(
      join(process.env.PRISM_HOME!, "habits.json"),
      JSON.stringify({
        version: 1,
        habits: [
          {
            name: "end my day",
            steps: [{ source: "slack", action: "post my summary" }],
            output: { format: "summary" },
          },
        ],
      }),
    );
    const run = await habits.call(context, { name: "end my day" });
    expect(run.ok && run.value).toMatchObject({
      name: "end my day",
      steps: [{ n: 1, source: "slack", action: "post my summary" }],
      output: { format: "summary" },
    });
  });

  it("updates a habit, including a long template, without an editor", async () => {
    await addHabit({
      name: "start my day",
      steps: [{ source: "github", action: "list my open PRs" }],
      output: { format: "standup" },
    });
    const template = "x".repeat(800);
    const run = await habits.call(context, {
      name: "start my day",
      update: { output: { template } },
    });
    expect(run.ok && run.value).toMatchObject({
      saved: true,
      output: { format: "standup", template },
    });
  });
});
