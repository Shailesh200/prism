import { z } from "zod";
import { writeLastPrepareChange } from "@repo-prism/dispatch";
import { defineTool } from "../tool-registry.js";

export const prepareChange = defineTool({
  name: "prepare_change",
  title: "Prepare a change",
  description:
    "One call before you edit: the files to open for this task (pack), existing helpers to reuse, and three House Style exemplars. Returns paths, symbol names and why — never file bodies. Call this instead of dumping search_symbols or knowledge_graph. Ambiguous names come back as candidates; do not pick silently. order and workingSet are null in this build.",
  inputSchema: {
    task: z
      .string()
      .min(1)
      .describe("What you are about to change, in plain language."),
    budget: z
      .number()
      .int()
      .min(200)
      .max(20_000)
      .optional()
      .describe(
        "Map-token budget for the pack (default 4000). Not source tokens.",
      ),
  },
  async call({ workspace, workspaceRoot }, args) {
    const result = await workspace.prepareChange({
      task: args.task,
      ...(args.budget !== undefined ? { budget: args.budget } : {}),
    });
    if (result.ok) {
      await writeLastPrepareChange(workspaceRoot, result.value);
    }
    return result;
  },
});
