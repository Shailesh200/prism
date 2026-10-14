import { z } from "zod";
import { ok } from "@repo-prism/shared";
import {
  loadLenses,
  overrideLensReview,
  readLensStore,
  recordLensReviews,
  removeLens,
  updateLens,
} from "@repo-prism/shared/lens-store";
import { LENS_EVIDENCE } from "@repo-prism/shared";
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

export const lensTool = defineTool({
  name: "lens",
  title: "Lenses",
  description:
    "List, show, edit, remove, re-seed, or overrule a review lens. Lenses are Architect, QA, and Dev by default. Their repo facts are re-read from the index each time; everything is stored under ~/.prism, never in the repo. An override is remembered on that lens so the same false alarm does not return. action=list (default); show needs id; edit needs id plus the definition; remove needs id (custom lenses only); seed re-reads repo facts; override needs reviewId and note.",
  inputSchema: {
    action: z
      .enum(["list", "show", "edit", "remove", "seed", "override"])
      .optional(),
    id: z.string().optional().describe("Lens id for show, edit, or remove."),
    name: z.string().optional(),
    role: z.string().optional(),
    focus: z.string().optional(),
    tone: z.string().optional(),
    checklist: z.array(z.string()).optional(),
    evidence: z.array(z.enum(LENS_EVIDENCE)).optional(),
    reviewId: z.string().optional().describe("Review id for action=override."),
    note: z.string().optional().describe("What the owner decided instead."),
  },
  async call({ workspace }, args) {
    const action = args.action ?? "list";
    if (action === "edit") {
      if (!args.id) return ok({ message: "edit needs id." });
      try {
        const views = await updateLens(workspace.rootPath, args.id, {
          name: args.name ?? "",
          role: args.role ?? "",
          focus: args.focus ?? "",
          ...(args.tone ? { tone: args.tone } : {}),
          checklist: args.checklist ?? [],
          evidence: args.evidence ?? [],
        });
        const one = views.find((row) => row.definition.id === args.id);
        return ok(one ?? { lenses: views.map((row) => row.definition.id) });
      } catch (cause) {
        return ok({
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
    if (action === "remove") {
      if (!args.id) return ok({ message: "remove needs id." });
      try {
        const views = await removeLens(workspace.rootPath, args.id);
        return ok({
          lenses: views.map((row) => row.definition.id),
        });
      } catch (cause) {
        return ok({
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
    if (action === "override") {
      if (!args.reviewId || !args.note?.trim()) {
        return ok({ message: "override needs reviewId and note." });
      }
      const learned = await overrideLensReview(
        workspace.rootPath,
        args.reviewId,
        args.note,
      );
      return ok(
        learned
          ? { learned }
          : { message: `No review with id ${args.reviewId}.` },
      );
    }
    const lenses = await loadLenses(workspace);
    if (action === "show") {
      const one = lenses.find((row) => row.definition.id === args.id);
      return ok(one ?? { message: `No lens named ${args.id ?? ""}.` });
    }
    return ok({
      lenses: lenses.map((row) => ({
        id: row.definition.id,
        name: row.definition.name,
        enabled: row.definition.enabled,
        facts: row.facts.length,
        reviews: row.history.length,
      })),
    });
  },
});
