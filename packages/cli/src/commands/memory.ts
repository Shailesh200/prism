/**
 * `prism remember` / `prism forget` / `prism memories` (M-091).
 *
 * Notes about this repository that Prepare and the receipt can read back.
 * Stored under `~/.prism/workspaces/<key>/memory.json`, never in the repo.
 */

import { err, ok, PrismErrorCode, prismError } from "@repo-prism/shared";
import {
  forgetWorkspaceMemory,
  loadWorkspaceMemories,
  rememberWorkspaceMemory,
} from "@repo-prism/shared/prism-home";
import { renderHeading } from "../output.js";
import type { CommandHandler } from "../runtime.js";

function text(positionals: readonly string[]): string {
  return positionals.join(" ").trim();
}

export const rememberCommand: CommandHandler = async (context) => {
  const note = text(context.args.positionals);
  if (!note) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        'Usage: prism remember "<note>" [--symbol <name>] [--path <path>]',
      ),
    );
  }
  const symbol = context.args.option("symbol");
  const path = context.args.option("path");
  const item = await rememberWorkspaceMemory(context.workspace.path, {
    text: note,
    ...(symbol ? { symbol } : {}),
    ...(path ? { path } : {}),
  });
  return ok({
    data: item,
    human: () => `Remembered ${item.id}: ${item.text}`,
  });
};

export const forgetCommand: CommandHandler = async (context) => {
  const needle = text(context.args.positionals);
  if (!needle) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        "Usage: prism forget <id or text>. List ids with: prism memories",
      ),
    );
  }
  const removed = await forgetWorkspaceMemory(context.workspace.path, needle);
  return ok({
    data: { removed },
    human: () =>
      removed === 0
        ? `No memory matched "${needle}".`
        : `Forgot ${removed} ${removed === 1 ? "memory" : "memories"}.`,
  });
};

export const memoriesCommand: CommandHandler = async (context) => {
  const items = await loadWorkspaceMemories(context.workspace.path);
  return ok({
    data: { items },
    human({ color }) {
      if (items.length === 0) {
        return 'No memories for this repository. Add one with: prism remember "..."';
      }
      return [
        renderHeading(`Memories (${items.length})`, color),
        "",
        ...items.map((item) => {
          const anchor = [item.symbol, item.path].filter(Boolean).join(" ");
          return `${item.id ?? "-"}  ${item.text}${anchor ? `  (${anchor})` : ""}`;
        }),
      ].join("\n");
    },
  });
};
