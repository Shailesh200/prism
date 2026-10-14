import { z } from "zod";
import { ok } from "@repo-prism/shared";
import {
  readLensStore,
  recordLensReviews,
} from "@repo-prism/shared/lens-store";
import { briefsFor, evidenceFor } from "../safety/lenses.js";
import { defineTool } from "../tool-registry.js";

const VerdictSchema = z.object({
  lens: z.string(),
  verdict: z.enum(["pass", "concern", "fail"]),
  reasoning: z.string().optional(),
  failedChecks: z.array(z.string()).optional(),
  sequential: z.boolean().optional(),
});

export const reviewWith = defineTool({
  name: "review_with",
  title: "Review with lenses",
  description:
    "Review a task or the current change through a lens. Architect, QA, and Dev are the defaults; the owner can add their own. Omit lenses and Prism picks one from the task: a plan, a new feature, or a pull request uses Architect; finding bugs uses QA; a daily fix uses Dev. Naming a lens uses that one, including a custom lens. action=brief returns that lens's procedure, checklist, memory, and evidence for you to follow. action=record stores the verdict. Prism does not call a model.",
  inputSchema: {
    action: z.enum(["brief", "record"]).optional().describe("Default brief."),
    lenses: z
      .array(z.string())
      .optional()
      .describe(
        'Lens ids, e.g. ["architect", "qa"]. Omit and Prism picks the one lens this task calls for.',
      ),
    task: z
      .string()
      .optional()
      .describe("What is being reviewed. Defaults to the current change."),
    verdicts: z
      .array(VerdictSchema)
      .optional()
      .describe("Verdicts from the subagents. Required for action=record."),
  },
  async call({ workspace }, args) {
    const task = args.task?.trim() || "Review the current uncommitted change.";
    if (args.action !== "record")
      return briefsFor(workspace, args.lenses, task);

    const verdicts = args.verdicts ?? [];
    if (verdicts.length === 0) {
      return ok({
        recorded: [],
        message: "record needs at least one verdict.",
      });
    }
    const store = await readLensStore(workspace.rootPath);
    const recorded = [];
    for (const verdict of verdicts) {
      const lens = store.lenses.find((row) => row.id === verdict.lens);
      if (!lens) continue;
      const evidence = await evidenceFor(workspace, lens.evidence, task);
      recorded.push(
        ...(await recordLensReviews(workspace.rootPath, task, evidence, [
          verdict,
        ])),
      );
    }
    const unknown = verdicts
      .map((row) => row.lens)
      .filter((id) => !store.lenses.some((row) => row.id === id));
    return ok({
      recorded: recorded.map((row) => ({
        id: row.id,
        lens: row.lens,
        verdict: row.verdict,
      })),
      ...(unknown.length > 0 ? { unknownLenses: unknown } : {}),
    });
  },
});
