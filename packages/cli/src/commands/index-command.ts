/**
 * `prism index` (M-028) — build or refresh the index.
 *
 * The one command whose progress output matters, and therefore the one that
 * proves progress goes to stderr: `prism index --json > out.json` must leave a
 * parseable file behind.
 */

import { ok } from "@prism/shared";
import { paint, renderFields, renderHeading } from "../output.js";
import type { CommandHandler } from "../runtime.js";

export const indexCommand: CommandHandler = async (context) => {
  const started = Date.now();
  const opened = await context.open();
  if (!opened.ok) return opened;

  const snapshot = opened.value.getIndex();
  if (!snapshot.ok) return snapshot;

  const elapsedMs = Date.now() - started;
  const { stats, warnings, indexedAt, rootPath } = snapshot.value;

  return ok({
    data: { rootPath, indexedAt, stats, warnings, elapsedMs },
    // Warnings are information, not a finding the user asked to be told about.
    findings: false,
    human(color) {
      const lines = [
        renderHeading("Index", color),
        "",
        renderFields(
          [
            ["Workspace", rootPath],
            ["Indexed at", indexedAt],
            ["Took", `${elapsedMs} ms`],
            ...Object.entries(stats).map(
              ([key, value]) => [key, String(value)] as const,
            ),
          ],
          color,
        ),
      ];

      if (warnings.length > 0) {
        lines.push(
          "",
          paint(`${warnings.length} warning(s)`, "yellow", color),
          ...warnings.map((warning) => `  ${warning}`),
        );
      }

      return lines.join("\n");
    },
  });
};
