/**
 * `prism findings` (M-074 B1) — list, mute, and unmute queueable findings.
 *
 * Muting is CLI-only, not an MCP tool: every Intelligence MCP tool is
 * read-only by design (`boundaries.test.ts` enforces it), and muting
 * writes `.prism/finding-mutes.json`. list_findings (MCP) already excludes
 * muted fingerprints by reading the same file.
 */

import { err, ok, PrismErrorCode, prismError } from "@repo-prism/shared";
import { paint, renderFields, renderHeading } from "../output.js";
import { wrap } from "../table.js";
import type { CommandHandler } from "../runtime.js";

const ACTIONS = ["list", "mute", "unmute"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

export const findingsCommand: CommandHandler = async (context) => {
  const raw = context.args.positionals[0];
  if (!raw || !isAction(raw)) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `Usage: prism findings <${ACTIONS.join("|")}> [fingerprint]`,
      ),
    );
  }

  const opened = await context.open();
  if (!opened.ok) return opened;
  const workspace = opened.value;

  if (raw === "list") {
    const found = workspace.listFindings();
    if (!found.ok) return found;
    const muted = await workspace.listMutedFindings();
    if (!muted.ok) return muted;
    const mutedSet = new Set(muted.value);
    const includeMuted = context.args.flag("all");
    const findings = includeMuted
      ? found.value.findings
      : found.value.findings.filter((f) => !mutedSet.has(f.fingerprint));

    return ok({
      data: { findings, mutedCount: mutedSet.size },
      human({ color, width }) {
        if (findings.length === 0) {
          return [
            renderHeading("Findings", color),
            "",
            mutedSet.size > 0
              ? `No findings — ${mutedSet.size} muted (pass --all to include them).`
              : "No findings.",
          ].join("\n");
        }
        const blocks = findings.flatMap((f) => {
          const prefix = `[${f.source}] `;
          const [first = "", ...rest] = wrap(
            f.title,
            Math.max(20, width - prefix.length),
          );
          return [
            `${paint(prefix.trimEnd(), "dim", color)} ${first}`,
            ...rest.map((line) => `  ${line}`),
            `  fingerprint: ${f.fingerprint}`,
            "",
          ];
        });
        blocks.pop(); // drop the trailing blank line
        return [renderHeading("Findings", color), "", ...blocks].join("\n");
      },
    });
  }

  const fingerprint = context.args.positionals[1]?.trim();
  if (!fingerprint) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `Usage: prism findings ${raw} <fingerprint>`,
      ),
    );
  }
  const result =
    raw === "mute"
      ? await workspace.muteFinding(fingerprint)
      : await workspace.unmuteFinding(fingerprint);
  if (!result.ok) return result;
  return ok({
    data: { muted: result.value },
    human({ color, width }) {
      return [
        renderHeading(raw === "mute" ? "Muted" : "Unmuted", color),
        "",
        renderFields([["Fingerprint", fingerprint]], color, width),
        "",
        ...wrap(`${result.value.length} finding(s) currently muted.`, width),
      ].join("\n");
    },
  });
};
