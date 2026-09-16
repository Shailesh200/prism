import { z } from "zod";
import { defineTool } from "../tool-registry.js";

export const guardSession = defineTool({
  name: "guard_session",
  title: "Guard the current session",
  description:
    "Rank the current dirty session — working-tree changes minus preExistingChanges, when you have that list from a job — by blast risk, so a human reads the highest-risk file first. Each file may carry duplicate (looks like an existing symbol), orphan (a new file nothing imports yet), or boundary (crosses into a package this session otherwise doesn't touch) flags. Call this before landing a session, not as a substitute for review_changes' test-impact and breaking-change view.",
  inputSchema: {
    preExistingChanges: z
      .array(z.string())
      .optional()
      .describe(
        "Workspace-relative paths already dirty before this session started (e.g. a job's own preExistingChanges). Excluded from the ranking, never silently absorbed.",
      ),
  },
  async call({ workspace }, args) {
    return await workspace.guardSession(
      args.preExistingChanges
        ? { preExistingChanges: args.preExistingChanges }
        : undefined,
    );
  },
});
