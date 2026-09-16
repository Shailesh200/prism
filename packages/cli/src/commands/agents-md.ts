/**
 * `prism agents-md` (M-073) — Living AGENTS.md.
 *
 * `generate` writes a deterministic AGENTS.md to `~/.prism/workspaces/<key>/`
 * — never into the repo, so it never needs a commit or a review of its own.
 * `check` re-verifies the claims it made (features, import cycles) against a
 * fresh index, so a stale doc fails loudly instead of quietly lying.
 */

import { err, ok, PrismErrorCode, prismError } from "@repo-prism/shared";
import { paint, renderFields, renderHeading } from "../output.js";
import { wrap } from "../table.js";
import type { CommandHandler } from "../runtime.js";

const ACTIONS = ["generate", "check"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

export const agentsMdCommand: CommandHandler = async (context) => {
  const raw = context.args.positionals[0];
  if (!raw || !isAction(raw)) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `Usage: prism agents-md <${ACTIONS.join("|")}>`,
      ),
    );
  }

  const opened = await context.open();
  if (!opened.ok) return opened;
  const workspace = opened.value;

  if (raw === "generate") {
    const generated = await workspace.generateAgentsMd();
    if (!generated.ok) return generated;
    return ok({
      data: generated.value,
      human({ color, width }) {
        return [
          renderHeading("AGENTS.md generated", color),
          "",
          renderFields([["Path", generated.value.path]], color),
          "",
          ...wrap(
            "Never written into this repository — regenerate any time with `prism agents-md generate`, and verify it with `prism agents-md check`.",
            width,
          ),
        ].join("\n");
      },
    });
  }

  const checked = await workspace.checkAgentsMd();
  if (!checked.ok) return checked;
  const result = checked.value;
  return ok({
    data: result,
    findings: !result.ok,
    human({ color, width }) {
      const lines = [
        renderHeading(
          result.ok ? "AGENTS.md is current" : "AGENTS.md is stale",
          color,
        ),
        "",
        renderFields([["Path", result.path]], color),
      ];
      if (result.issues.length > 0) {
        lines.push("");
        for (const issue of result.issues) {
          const [first = "", ...rest] = wrap(issue.detail, width - 2);
          lines.push(`${paint(`[${issue.kind}]`, "red", color)} ${first}`);
          lines.push(...rest.map((line) => `  ${line}`));
        }
      }
      return lines.join("\n");
    },
  });
};
