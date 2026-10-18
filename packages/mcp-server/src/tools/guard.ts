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
    "Check my changes. With review:true, write the review from `review.reading` and do not print risk scores. Start with what the change does, then the finding count, with no Receipt on that line. Bold each group title: Critical, High, Low, and Nit. Number findings straight through. Bold each finding title. Under it, an unordered list: This code, Breaks when, Change, and Left as is. Keep `reading.notes`; a Critical stays Critical. Read `reading.targets` and only the callers and tests listed there, in the order correct, safe, load, tested, speed, then smaller code. A finding needs a concrete case. A caller that is not listed was not measured. After the findings, one explanation line and no Receipt label, then one line for what was not opened. End with one Receipt only: NO-SHIP if any finding is Critical, NOT PROVEN if any finding is High, otherwise SHIP, then the cheapest check or fix when it is not SHIP. Prism does not call a model; you write that review from the pack. Call before landing a session or to review a branch.",
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
