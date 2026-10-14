/**
 * `prism envelope` (M-094, ADR-0066): what Prism put into agents' context in
 * this repository, by tool, with the calls over their budget.
 *
 * Reads only the ledger's sizes and tool names. "Estimated saved" stays
 * blank until the real-agent benchmark (M-098) measures a baseline.
 */

import { envelopeReport, readEnvelopeLedger } from "@repo-prism/core/envelope";
import { ok } from "@repo-prism/shared";
import { renderHeading } from "../output.js";
import type { CommandHandler } from "../runtime.js";

function compact(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

export const envelopeCommand: CommandHandler = async (context) => {
  const days = Number(context.args.option("days") ?? "7");
  const window = Number.isFinite(days) && days > 0 ? days : 7;
  const since = Date.now() - window * 24 * 3600_000;
  const all = await readEnvelopeLedger(context.workspace.path);
  // EN-1/EN-5: `--session <id>` narrows to one agent session; `--session`
  // with no id ("latest") takes the session of the newest row.
  const sessionArg = context.args.option("session");
  const latest = [...all].reverse().find((row) => row.sessionId)?.sessionId;
  const session =
    sessionArg === undefined
      ? undefined
      : sessionArg === "latest" || sessionArg === ""
        ? latest
        : sessionArg;
  const ledger =
    sessionArg === undefined
      ? all
      : all.filter((row) => row.sessionId === session);
  const report = envelopeReport(ledger, { since });
  const today = envelopeReport(ledger, {
    since: new Date(new Date().toDateString()).getTime(),
  });
  return ok({
    data: { days: window, ...(session ? { session } : {}), today, report },
    human({ color }) {
      if (report.calls === 0) {
        return sessionArg !== undefined
          ? `No Prism calls recorded for session ${session ?? "(none recorded)"}.`
          : `No Prism calls recorded in the last ${window} days for this repository.`;
      }
      const lines = [
        renderHeading(
          session
            ? `Envelope — session ${session}`
            : `Envelope — last ${window} days`,
          color,
        ),
        "",
        `Today        ${today.calls} calls · ${compact(today.tokens)} tokens in`,
        `${window}-day total  ${report.calls} calls · ${compact(report.tokens)} tokens in · ${report.fromHooks} from hooks · ${report.overBudget} over budget`,
        "Est. saved   — not calibrated yet (needs the real-agent benchmark)",
        "",
        "Tool                  calls   tokens   p95 / budget   over",
      ];
      for (const row of report.byTool.slice(0, 12)) {
        lines.push(
          `${row.tool.padEnd(20)}  ${String(row.calls).padStart(5)}  ${compact(row.tokens).padStart(7)}   ${`${compact(row.p95Tokens)} / ${compact(row.budget)}`.padEnd(13)}  ${row.overBudget}`,
        );
      }
      if (report.worst.length > 0) {
        lines.push("", "Largest over budget:");
        for (const w of report.worst) {
          lines.push(
            `  ${w.ts.slice(0, 16).replace("T", " ")}  ${w.tool}  ${compact(w.tokens)} of ${compact(w.budget)}`,
          );
        }
      }
      return lines.join("\n");
    },
  });
};
