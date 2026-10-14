import { z } from "zod";
import { writeLastPrepareChange } from "@repo-prism/core/envelope";
import {
  PREPARE_RESPONSE_BUDGET,
  PREPARE_RESPONSE_CEILING,
} from "@repo-prism/shared";
import { defineTool } from "../tool-registry.js";

export const prepareChange = defineTool({
  name: "prepare_change",
  title: "Prepare a change",
  description:
    "One call before you edit: the files to open for this task (pack), existing helpers to reuse, House Style exemplars, notes (remembered facts and ADR rationale), and a work order (in-scope, off-limits generated/vendor, needs sign-off). Paths, symbol names and why — never file bodies. The whole answer fits a token budget (default 2000); when it is cut, `trimmed` says what was dropped. Ambiguous names come back as candidates; do not pick silently.",
  inputSchema: {
    task: z
      .string()
      .min(1)
      .describe("What you are about to change, in plain language."),
    budget: z
      .number()
      .int()
      .min(200)
      .max(PREPARE_RESPONSE_CEILING)
      .optional()
      .describe(
        `Token budget for the whole response, bytes ÷ 4 (default ${PREPARE_RESPONSE_BUDGET}, max ${PREPARE_RESPONSE_CEILING}).`,
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
