import { ok } from "@repo-prism/shared";
import { z } from "zod";
import { allWorkspaceRelative } from "../paths.js";
import { readSessionBaseline } from "../safety/receipt-service.js";
import { defineTool } from "../tool-registry.js";
import { reviewInput, runReview } from "./impact.js";

export const guardSession = defineTool({
  name: "guard_session",
  title: "Guard the current session",
  alwaysLoad: true,
  description:
    "Check my changes. Ranks this session's changes (working-tree changes minus what was already changed when the session began, or minus preExistingChanges; only `paths` when given) by blast risk so the highest-risk file is read first; files may carry duplicate, orphan or boundary flags, and `findings` lists each as what/where/fix/riskIfSkipped. With review:true it also returns `review`: blast radius, test impact, breaking-change hints, and `reading`. `reading` is the code review: open `reading.targets` (path, measured callers, tests), treat `reading.proven` as already wrong, and write the report in the reply — what the change does, numbered findings (what this is, problem, fix, if we skip it) in the order correct, safe, load, tested, speed, lean. A finding needs a concrete case. Do not name a caller that is not listed. Prism does not call a model; you write that prose from the pack. Call before landing a session or to review a branch.",
  inputSchema: {
    preExistingChanges: z
      .array(z.string())
      .optional()
      .describe(
        "Workspace-relative paths already dirty before this session started (e.g. a job's own preExistingChanges). Excluded from the ranking, never silently absorbed.",
      ),
    review: z
      .boolean()
      .optional()
      .describe(
        "Also return the full review (test impact, breaking changes, risk band, lens findings).",
      ),
    ...reviewInput,
  },
  async call(context, args) {
    // The session's own changes by default, not the whole dirty tree
    // (website round: 400 files ranked for a 7-file change).
    const preExisting =
      args.preExistingChanges ??
      readSessionBaseline(context.workspaceRoot, undefined, context.env)?.dirty;
    const named =
      args.paths && args.paths.length > 0
        ? allWorkspaceRelative(context.workspaceRoot, args.paths)
        : null;
    if (named && !named.ok) return named;
    const guard = await context.workspace.guardSession({
      ...(preExisting ? { preExistingChanges: preExisting } : {}),
      ...(named ? { paths: named.value } : {}),
    });
    if (!guard.ok || !args.review) return guard;
    const paths =
      args.paths ??
      (args.base || guard.value.sessionPaths.length === 0
        ? undefined
        : guard.value.sessionPaths);
    const review = await runReview(context, {
      ...(paths ? { paths } : {}),
      ...(args.base ? { base: args.base } : {}),
      ...(args.lens ? { lens: args.lens } : {}),
      ...(args.format ? { format: args.format } : {}),
    });
    if (!review.ok) return review;
    return ok({ ...guard.value, review: review.value });
  },
});
