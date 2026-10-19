/**
 * `prism habit` (plan P15): manage the routines the `habits` MCP tool hands
 * to agents. Each habit is a skill: `~/.prism/skills/<slug>/SKILL.md`.
 *
 *   prism habit add "<name>" --step "github: list my open PRs | repo:me/x"… [--output standup] [--template "…"] [--description "…"]
 *   prism habit list
 *   prism habit show "<name>"
 *   prism habit edit "<name>"     opens $EDITOR on the habit's SKILL.md, re-validated on save
 *   prism habit remove "<name>"
 */

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err, ok, PrismErrorCode, prismError } from "@repo-prism/shared";
import {
  addHabit,
  findHabit,
  HABIT_OUTPUT_FORMATS,
  habitSkillMarkdown,
  habitsDir,
  parseHabitSkill,
  parseStep,
  readHabits,
  removeHabit,
  replaceHabit,
  type Habit,
} from "@repo-prism/shared/habits";
import { renderHeading } from "../output.js";
import type { CommandHandler } from "../runtime.js";
import { plural } from "../table.js";

const USAGE =
  'Usage: prism habit list | add "<name>" --step "source: action [| filter]"… [--output standup|summary|checklist|table|free] [--template "…"] [--description "…"] | show "<name>" | edit "<name>" | remove "<name>"';

const usage = (message = USAGE) =>
  err(prismError(PrismErrorCode.VALIDATION, message));

export { parseStep };

function renderHabit(habit: Habit): string {
  return [
    `${habit.name}${habit.description ? ` — ${habit.description}` : ""}`,
    ...habit.steps.map(
      (step, i) =>
        `  ${i + 1}. ${step.source}: ${step.action}${step.filter ? ` (${step.filter})` : ""}`,
    ),
    `  output: ${habit.output.format}${habit.output.template ? ` — ${habit.output.template}` : ""}`,
  ].join("\n");
}

export const habitCommand: CommandHandler = async (context) => {
  const [action = "list", name] = context.args.positionals;
  const file = await readHabits();
  if (!file.ok) return file;
  const habits = file.value.habits;

  if (action === "list") {
    return ok({
      data: { path: habitsDir(), habits },
      human: ({ color }) =>
        habits.length === 0
          ? `No habits yet. Add one:\n  prism habit add "start my day" --output standup \\\n    --step "github: list my open PRs" \\\n    --step "linear: my in-progress issues"`
          : [
              renderHeading(`Habits (${habits.length})`, color),
              "",
              ...habits.map(
                (h) =>
                  `${h.name.padEnd(20)} ${plural(h.steps.length, "step")}${h.description ? ` — ${h.description}` : ""}`,
              ),
              "",
              `Stored as skills in ${habitsDir()}`,
            ].join("\n"),
    });
  }

  // An unknown action is a usage error, not a lookup of its argument.
  if (!["add", "show", "edit", "remove"].includes(action) || !name) {
    return usage();
  }

  if (action === "add") {
    const raw = context.args.values("step");
    const steps = raw.map(parseStep);
    const bad = raw.find((_, i) => !steps[i]);
    if (raw.length === 0 || bad !== undefined) {
      return usage(
        bad === undefined
          ? 'prism habit add needs at least one --step "source: action".'
          : `Step "${bad.slice(0, 40)}" must look like "source: action".`,
      );
    }
    const format = context.args.option("output") ?? "summary";
    if (!(HABIT_OUTPUT_FORMATS as readonly string[]).includes(format)) {
      return usage(
        `--output must be one of ${HABIT_OUTPUT_FORMATS.join(", ")}.`,
      );
    }
    const template = context.args.option("template");
    const description = context.args.option("description");
    const added = await addHabit({
      name,
      ...(description ? { description } : {}),
      steps,
      output: { format, ...(template ? { template } : {}) },
    });
    if (!added.ok) return added;
    return ok({
      data: added.value,
      human: () =>
        `Added habit "${added.value.name}" (${plural(added.value.steps.length, "step")}). Ask your agent: "run my ${added.value.name} habit".`,
    });
  }

  const match = findHabit(habits, name);
  if (match.kind === "missing") {
    return usage(
      `No habit named "${name}".${match.near.length > 0 ? ` Did you mean: ${match.near.join(", ")}?` : ""}`,
    );
  }
  const habit = match.habit;

  if (action === "show") {
    return ok({ data: habit, human: () => renderHabit(habit) });
  }

  if (action === "remove") {
    const removed = await removeHabit(habit.name);
    if (!removed.ok) return removed;
    return ok({
      data: { removed: habit.name },
      human: () => `Removed habit "${habit.name}".`,
    });
  }

  if (action === "edit") {
    const template = context.args.option("template");
    const description = context.args.option("description");
    const output = context.args.option("output");
    const rawSteps = context.args.values("step");
    if (
      template !== undefined ||
      description !== undefined ||
      output !== undefined ||
      rawSteps.length > 0
    ) {
      const steps = rawSteps.map(parseStep);
      const bad = rawSteps.find((_, i) => !steps[i]);
      if (bad !== undefined) {
        return usage(
          `Step "${bad.slice(0, 40)}" must look like "source: action".`,
        );
      }
      if (
        output !== undefined &&
        !(HABIT_OUTPUT_FORMATS as readonly string[]).includes(output)
      ) {
        return usage(
          `--output must be one of ${HABIT_OUTPUT_FORMATS.join(", ")}.`,
        );
      }
      const saved = await replaceHabit(habit.name, {
        ...habit,
        ...(description !== undefined ? { description } : {}),
        ...(rawSteps.length > 0 ? { steps } : {}),
        output: {
          ...habit.output,
          ...(output !== undefined ? { format: output } : {}),
          ...(template !== undefined ? { template } : {}),
        },
      });
      if (!saved.ok) return saved;
      return ok({
        data: saved.value,
        human: () => `Saved habit "${saved.value.name}".`,
      });
    }
    const editor = process.env.VISUAL || process.env.EDITOR;
    if (!editor) {
      return usage(
        "No $EDITOR is set. Pass --template, --step, --output, or --description, or edit the habit's SKILL.md.",
      );
    }
    const dir = await mkdtemp(join(tmpdir(), "prism-habit-"));
    const path = join(dir, "SKILL.md");
    try {
      await writeFile(path, habitSkillMarkdown(habit), { mode: 0o600 });
      // $EDITOR may carry flags ("code --wait"), so it goes through the
      // shell as one command line with the temp path quoted.
      const run = spawnSync(`${editor} ${JSON.stringify(path)}`, {
        stdio: "inherit",
        shell: true,
      });
      if (run.status !== 0)
        return usage(`Editor exited with ${run.status}; nothing changed.`);
      const edited = parseHabitSkill(await readFile(path, "utf8"));
      if (!edited) {
        return usage("The habit marker was removed; nothing changed.");
      }
      if (!edited.ok) return edited;
      const saved = await replaceHabit(habit.name, edited.value);
      if (!saved.ok) return saved;
      return ok({
        data: saved.value,
        human: () => `Saved habit "${saved.value.name}".`,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  return usage();
};
