/**
 * "What is this repository?" (M-029).
 *
 * These are the commands someone runs on day one in an unfamiliar codebase, so
 * the human rendering matters more here than anywhere else: the answer has to
 * be readable before it is complete.
 */

import { ok } from "@repo-prism/shared";
import { paint, renderFields, renderHeading } from "../output.js";
import type { CommandHandler } from "../runtime.js";
import { plural, renderTable, wrap } from "../table.js";
import { toWorkspaceRelative } from "../target.js";
import { bound, parseLimit, truncationNote } from "../thresholds.js";

export const explainCommand: CommandHandler = async (context) => {
  const [input] = context.args.positionals;
  const path = toWorkspaceRelative(
    context.workspace.path,
    context.cwd,
    input ?? "",
  );
  if (!path.ok) return path;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.explainArea(path.value);
  if (!report.ok) return report;

  const area = report.value;

  return ok({
    data: area,
    human({ color, width }) {
      return [
        renderHeading(area.path, color),
        "",
        ...wrap(area.summary, width),
        "",
        renderFields(
          [
            ["Domains", area.domains.join(", ") || "none detected"],
            [
              "Dependencies",
              `${plural(area.dependencyDegree.in, "dependent")} in, ${area.dependencyDegree.out} out`,
            ],
            [
              "Owners",
              area.owners.join(", ") || "unknown (no local git history)",
            ],
            ...(area.fileRole ? ([["Role", area.fileRole]] as const) : []),
          ],
          color,
          width,
        ),
      ].join("\n");
    },
  });
};

export const exploreCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const [input] = context.args.positionals;
  const symbol = context.args.flag("symbol");

  const path = symbol
    ? undefined
    : toWorkspaceRelative(context.workspace.path, context.cwd, input ?? "");
  if (path && !path.ok) return path;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const inFile = context.args.option("in");
  const declaredIn = inFile
    ? toWorkspaceRelative(context.workspace.path, context.cwd, inFile)
    : undefined;
  if (declaredIn && !declaredIn.ok) return declaredIn;

  const report = await opened.value.exploreCode(
    symbol
      ? {
          kind: "symbol",
          name: input ?? "",
          ...(declaredIn?.ok ? { path: declaredIn.value } : {}),
        }
      : { kind: "file", path: path?.ok ? path.value : (input ?? "") },
  );
  if (!report.ok) return report;

  const explored = report.value;

  return ok({
    data: explored,
    human({ color, width }) {
      // One row per *file* rather than per reference. A file that uses a
      // helper forty times is one answer to "who uses this", not forty.
      const byFile = new Map<string, number>();
      for (const usage of explored.usages) {
        byFile.set(usage.path, (byFile.get(usage.path) ?? 0) + 1);
      }
      const usages = bound(
        [...byFile].sort((a, b) => b[1] - a[1]),
        limit.value,
      );

      // `explored.summary` is a machine one-liner restating the fields below.
      const lines = [
        renderHeading(explored.path, color),
        "",
        renderFields(
          [
            [
              "Usages",
              `${explored.usages.length} across ${plural(byFile.size, "file")}`,
            ],
            ["Similar files", String(explored.similar.length)],
            [
              "Owners",
              explored.ownership.contributors
                .slice(0, 3)
                .map((contributor) => contributor.author)
                .join(", ") || "unknown",
            ],
          ],
          color,
          width,
        ),
      ];

      if (usages.items.length > 0) {
        lines.push(
          "",
          renderTable({
            columns: [
              { header: "USED BY", flex: true },
              { header: "REFS", align: "right" },
            ],
            rows: usages.items.map(([usedBy, count]) => [
              { text: usedBy },
              { text: String(count) },
            ]),
            color,
            width,
          }),
        );
        const note = truncationNote(usages, "files");
        if (note) lines.push(paint(note, "dim", color));
      }

      return lines.join("\n");
    },
  });
};
