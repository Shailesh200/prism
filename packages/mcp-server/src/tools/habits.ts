import { ok } from "@repo-prism/shared";
import {
  findHabit,
  habitInstructions,
  readHabits,
} from "@repo-prism/shared/habits";
import { z } from "zod";
import { defineTool } from "../tool-registry.js";

export const habits = defineTool({
  name: "habits",
  title: "Habits",
  description:
    "The user's saved routines (e.g. 'start my day'). With no name: the list of habits. With a name: the ordered steps (source, action, filter) and output format. Prism fetches nothing: run each step yourself with your connected tools, then write the result in the given format. Each habit is a skill file in ~/.prism/skills; users manage them with `prism habit add|list|show|edit|remove`.",
  inputSchema: {
    name: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe("Habit to run; case and spacing are ignored."),
  },
  async call(_context, args) {
    const file = await readHabits();
    if (!file.ok) return file;
    const all = file.value.habits;
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
