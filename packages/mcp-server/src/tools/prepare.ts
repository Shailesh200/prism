import { z } from "zod";
import { writeLastPrepareChange } from "@repo-prism/core/prepare-history";
import {
  PREPARE_RESPONSE_BUDGET,
  PREPARE_RESPONSE_CEILING,
  type PrepareChange,
  buildPromptPack,
  lensLabel,
  promptSummaryLine,
} from "@repo-prism/shared";
import { defineTool } from "../tool-registry.js";
import { dedupePrepareChange } from "@repo-prism/shared/session-dedupe";
import { promptLens } from "../safety/prompt-context.js";

/** Set by `prism install` for hosts whose prompt hook already shows the line and lens. */
export const PROMPT_HOOK_ENV = "PRISM_PROMPT_HOOK";

/** One server process is one agent session when the agent passes no session id. */
const SERVER_SESSION = `mcp-${process.pid}-${Date.now()}`;

export const prepareChange = defineTool({
  name: "prepare_change",
  title: "Prepare a change",
  alwaysLoad: true,
  description:
    'One call before you edit: `prism`, a one-line summary to start your reply with, the lens to work by (its steps, e.g. the smallest complete change), the files to open for this task (pack with exported signatures and path:line anchors), existing helpers to reuse, one House Style pointer, notes (remembered facts and ADR rationale), and a work order. Bodies only for the top symbol when it is ≤ 40 lines; otherwise call graph {mode:"symbol", path, name, body:true}. The whole answer fits a token budget (default 2000); when it is cut, `trimmed` says what was dropped. Ambiguous names come back as candidates; do not pick silently.',
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
    sessionId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Host session id. When set, files already sent this session are replaced with a short reference (P4).",
      ),
    refresh: z
      .boolean()
      .optional()
      .describe(
        "sessionId: ignore prior sends and resend full context (e.g. after host compaction).",
      ),
  },
  async call({ workspace, workspaceRoot, env }, args) {
    const result = await workspace.prepareChange({
      task: args.task,
      ...(args.budget !== undefined ? { budget: args.budget } : {}),
    });
    if (!result.ok) return result;
    let value = result.value;
    if (args.sessionId) {
      const index = workspace.getIndex();
      const fileHashes = new Map<string, string>();
      if (index.ok) {
        for (const f of index.value.files) {
          if (f.contentHash) fileHashes.set(f.path, f.contentHash);
        }
      }
      value = dedupePrepareChange(value, {
        sessionId: args.sessionId,
        ...(args.refresh ? { refresh: true } : {}),
        fileHashes,
        ...(env ? { env } : {}),
      }).prep;
    }
    await writeLastPrepareChange(workspaceRoot, value, env);
    return { ok: true as const, value };
  },
  // Hosts with no prompt hook (Cursor agent, opencode) get here what the hook
  // gives Claude: the user's line, the lens once per session (again when the
  // scope widens) and the plan cue, from the same builder. Then the receipt ask.
  async present(value, args, { workspaceRoot, env, tools }) {
    if (env[PROMPT_HOOK_ENV] === "1") return value;
    const lens = await promptLens(
      workspaceRoot,
      args.task,
      "change",
      args.sessionId ?? SERVER_SESSION,
      env,
    ).catch(() => undefined);
    const pack = buildPromptPack({
      prep: value as PrepareChange,
      prompt: args.task,
      fromTool: true,
      ...(lens ? { lens } : {}),
    });
    return {
      prism: promptSummaryLine(
        lens ? [lensLabel(lens.name), ...pack.summary] : pack.summary,
        true,
      ),
      ...(lens ? { lens: { name: lens.name, steps: lens.procedure } } : {}),
      ...(pack.cue.length > 0 ? { plan: pack.cue.join(" ") } : {}),
      ...(tools.has("receipt")
        ? {
            finish:
              "After editing, call receipt and report its verdict in one line.",
          }
        : {}),
      ...(value as object),
    };
  },
});
