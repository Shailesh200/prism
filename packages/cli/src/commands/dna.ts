/**
 * `prism dna` (M-028) — what is this repository?
 *
 * The first real report command, and the template for M-029: the JSON is the
 * Core DTO verbatim, and the human rendering is a *view* of it rather than a
 * different answer.
 */

import { ok } from "@prism/shared";
import { paint, renderFields, renderHeading } from "../output.js";
import { qualityCell } from "../table.js";
import type { CommandHandler } from "../runtime.js";

export const dnaCommand: CommandHandler = async (context) => {
  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.getDna();
  if (!report.ok) return report;

  const dna = report.value;

  return ok({
    data: dna,
    human({ color }) {
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

      return lines.join("\n");
    },
  });
};
