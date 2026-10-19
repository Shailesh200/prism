import { err, ok, PrismErrorCode, prismError } from "@repo-prism/shared";
import {
  findHabit,
  HABIT_OUTPUT_FORMATS,
  habitInstructions,
  readHabits,
  replaceHabit,
  type Habit,
} from "@repo-prism/shared/habits";
import { z } from "zod";
import { defineTool } from "../tool-registry.js";

export const habits = defineTool({
  name: "habits",
  title: "Habits",
  description:
    "The user's saved routines (e.g. 'start my day'). With no name: the list of habits. With a name: the ordered steps (source, action, filter) and output format. Prism fetches nothing: run each step yourself with your connected tools, then write the result in the given format. To change a habit, pass name and update. Do not run `prism habit edit`; that opens an editor.",
  inputSchema: {
    name: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe("Habit to run or update; case and spacing are ignored."),
    update: z
      .object({
        description: z.string().optional(),
        steps: z
          .array(
            z.object({
              source: z.string(),
              action: z.string(),
              filter: z.string().optional(),
            }),
          )
          .min(1)
          .optional(),
        output: z
          .object({
            format: z.enum(HABIT_OUTPUT_FORMATS).optional(),
            template: z.string().optional(),
          })
          .optional(),
      })
      .optional()
      .describe(
        "Replace these fields. Steps, when set, replace the whole list. Omitted fields stay as they are.",
      ),
  },
  async call(_context, args) {
    const file = await readHabits();
    if (!file.ok) return file;
    const all = file.value.habits;
    if (args.update) {
      if (!args.name) {
        return err(
          prismError(PrismErrorCode.VALIDATION, "Name the habit to update."),
        );
      }
      const match = findHabit(all, args.name);
      if (match.kind !== "found") {
        return ok({
          found: false,
          name: args.name,
          near: match.near,
          habits: all.map((h) => h.name),
        });
      }
      const current = match.habit;
      const format = args.update.output?.format ?? current.output.format;
      const template =
        args.update.output && "template" in args.update.output
          ? args.update.output.template
          : current.output.template;
      const description =
        args.update.description !== undefined
          ? args.update.description
          : current.description;
      const next: Habit = {
        name: current.name,
        ...(description ? { description } : {}),
        steps: args.update.steps ?? current.steps,
        output: {
          format,
          ...(template ? { template } : {}),
        },
      };
      const saved = await replaceHabit(current.name, next);
      if (!saved.ok) return saved;
      return ok({ saved: true, ...habitInstructions(saved.value) });
    }
    if (!args.name) {
      return ok({
        habits: all.map((h) => ({
          name: h.name,
          ...(h.description ? { description: h.description } : {}),
          steps: h.steps.length,
        })),
        ...(all.length === 0
          ? {
              hint: 'No habits yet. The user can add one: prism habit add "start my day" --step "github: list my open PRs" --output standup',
            }
          : {}),
      });
    }
    const match = findHabit(all, args.name);
    if (match.kind === "found") return ok(habitInstructions(match.habit));
    return ok({
      found: false,
      name: args.name,
      near: match.near,
      habits: all.map((h) => h.name),
    });
  },
});
