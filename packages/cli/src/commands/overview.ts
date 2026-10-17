/**
 * `prism overview` (plan §5.9): what is this repository? The same answer as
 * the MCP `repository_overview` tool: DNA, stack and landmarks. Replaces the
 * 1.x `dna`, `stack` and `landmarks` commands (deleted in 2.0).
 */

import { ok } from "@repo-prism/shared";
import { paint, renderFields, renderHeading } from "../output.js";
import { qualityCell, renderTable } from "../table.js";
import { bound, parseLimit, truncationNote } from "../thresholds.js";
import type { CommandHandler } from "../runtime.js";

export const overviewCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.getDna();
  if (!report.ok) return report;
  const stack = await opened.value.getStackProfile();
  if (!stack.ok) return stack;
  const listed = opened.value.listLandmarks();
  if (!listed.ok) return listed;

  const dna = report.value;
  const landmarks = bound(listed.value, limit.value);

  return ok({
    data: { dna, stack: stack.value, landmarks },
    human({ color, width }) {
      const languages = dna.languages
        .map((lang) => `${lang.id} ${Math.round(lang.share * 100)}%`)
        .join(", ");

      // `dna.summary` is a machine-readable one-liner that restates every
      // section below it. It stays in `--json`; repeating it here would make
      // the reader parse the same facts twice.
      const lines = [
        renderHeading("Repository DNA", color),
        "",
        renderFields(
          [
            ["Languages", languages || "none detected"],
            [
              "Frameworks",
              dna.frameworks.length > 0
                ? dna.frameworks.join(", ")
                : "none detected",
            ],
            ["Package manager", dna.packageManager ?? "unknown"],
            [
              "Test runners",
              dna.testRunners.length > 0
                ? dna.testRunners.join(", ")
                : "none detected",
            ],
            ["Primary domain", dna.primaryDomain ?? "none"],
          ],
          color,
        ),
      ];

      if (dna.architectureHints.length > 0) {
        lines.push(
          "",
          renderHeading("Architecture hints", color),
          ...dna.architectureHints.map((hint) => `  ${hint}`),
        );
      }

      if (dna.rankedDomains.length > 0) {
        lines.push("", renderHeading("Domains", color));
        for (const domain of dna.rankedDomains) {
          // Banded through the shared helper rather than a local threshold, so
          // "confident" means the same here as it does in the UI.
          const cell = qualityCell(domain.confidence * 100);
          lines.push(
            `  ${domain.id.padEnd(20)} ${paint(
              `${cell.text}%`,
              cell.style ?? "dim",
              color,
            )}`,
          );
        }
      }

      if (landmarks.items.length > 0) {
        lines.push(
          "",
          renderHeading("Landmarks", color),
          renderTable({
            columns: [
              { header: "LANDMARK" },
              { header: "KIND" },
              { header: "PATH", flex: true },
            ],
            rows: landmarks.items.map((landmark) => [
              { text: landmark.label },
              { text: landmark.kind },
              { text: landmark.path },
            ]),
            color,
            width,
          }),
        );
        const note = truncationNote(landmarks, "landmarks");
        if (note) lines.push(paint(note, "dim", color));
      }

      return lines.join("\n");
    },
  });
};
