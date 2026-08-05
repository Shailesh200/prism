/**
 * "Is this change safe?" (M-029).
 *
 * The commands with a `--fail-on` flag, and therefore the ones that belong in
 * a pipeline. Everything here reports; nothing here writes to the repository.
 */

import { ok, riskBandDescriptor } from "@prism/shared";
import { paint, renderFields, renderHeading } from "../output.js";
import type { CommandHandler, CommandContext } from "../runtime.js";
import { bandStyle, plural, renderTable, scoreCell, wrap } from "../table.js";
import { allWorkspaceRelative, resolveTarget } from "../target.js";
import {
  bound,
  meetsThreshold,
  parseFailOn,
  parseFailOnCount,
  parseLimit,
  truncationNote,
} from "../thresholds.js";

/** Every impact command names its target the same way. */
function target(context: CommandContext) {
  const [input] = context.args.positionals;
  const inFile = context.args.option("in");
  return resolveTarget(context.workspace.path, context.cwd, input ?? "", {
    symbol: context.args.flag("symbol"),
    ...(inFile === undefined ? {} : { in: inFile }),
  });
}

/** `Risk 72  High Impact Potential`, worded and coloured by the shared band. */
function riskLine(risk: number, color: boolean): readonly [string, string] {
  const band = riskBandDescriptor(risk);
  return [
    "Risk",
    `${Math.round(risk)}/100  ${paint(band.label, bandStyle(band.id), color)}`,
  ];
}

export const blastCommand: CommandHandler = async (context) => {
  const failOn = parseFailOn(context.args.option("failOn"));
  if (!failOn.ok) return failOn;
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const resolved = target(context);
  if (!resolved.ok) return resolved;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.blastRadius({
    ...resolved.value,
    ...(context.args.flag("delete") ? { intent: "delete" as const } : {}),
  });
  if (!report.ok) return report;

  const blast = report.value;

  return ok({
    data: blast,
    findings: meetsThreshold(blast.risk, failOn.value),
    human({ color, width }) {
      const affected = bound(blast.affectedFiles, limit.value);
      const lines = [
        renderHeading(`Blast radius: ${blast.origin.id}`, color),
        "",
        renderFields(
          [
            riskLine(blast.risk, color),
            ["Affected files", String(blast.affectedFiles.length)],
            ["Tests likely affected", String(blast.testsLikelyAffected.length)],
            ["Breaking-change hints", String(blast.breakingChanges.length)],
          ],
          color,
          width,
        ),
      ];

      if (blast.truncated) {
        lines.push(
          "",
          paint(
            "Traversal stopped at the depth limit — this list is incomplete.",
            "yellow",
            color,
          ),
        );
      }
      if (blast.coverageNote) {
        lines.push(
          "",
          ...wrap(blast.coverageNote, width, "  ").map((line) =>
            paint(line, "dim", color),
          ),
        );
      }

      if (affected.items.length > 0) {
        lines.push(
          "",
          renderTable({
            columns: [
              { header: "FILE", flex: true },
              { header: "DEPTH", align: "right" },
              { header: "WHY" },
            ],
            rows: affected.items.map((item) => [
              { text: item.path },
              { text: String(item.depth) },
              { text: item.reason },
            ]),
            color,
            width,
          }),
        );
        const note = truncationNote(affected, "files");
        if (note) lines.push(paint(note, "dim", color));
      }

      if (blast.breakingChanges.length > 0) {
        lines.push("", renderHeading("Breaking-change hints", color));
        for (const hint of blast.breakingChanges) {
          lines.push(`  ${hint.message}`);
        }
      }

      return lines.join("\n");
    },
  });
};

export const reviewCommand: CommandHandler = async (context) => {
  const failOn = parseFailOn(context.args.option("failOn"));
  if (!failOn.ok) return failOn;
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const base = context.args.option("base");

  // Explicit paths win. Otherwise ask Core what changed, because a terminal has
  // no SCM view to select from and making the user paste a file list would be
  // answering a different question from the one they asked.
  let paths: readonly string[];
  let label: string | undefined = base;

  if (context.args.positionals.length > 0) {
    const resolved = allWorkspaceRelative(
      context.workspace.path,
      context.cwd,
      context.args.positionals,
    );
    if (!resolved.ok) return resolved;
    paths = resolved.value;
  } else {
    const changed = opened.value.getChangedPaths(
      base === undefined ? {} : { base },
    );
    if (!changed.ok) return changed;
    paths = changed.value.paths;
    label = changed.value.base;
  }

  if (paths.length === 0) {
    return ok({
      data: { base: label, items: [], overallRisk: 0, totalAffectedFiles: 0 },
      human: () =>
        `No changes to review against ${label ?? "the working tree"}.`,
    });
  }

  const report = await opened.value.reviewChanges({
    paths,
    ...(label === undefined ? {} : { base: label }),
  });
  if (!report.ok) return report;

  const review = report.value;

  return ok({
    data: review,
    findings: meetsThreshold(review.overallRisk, failOn.value),
    human({ color, width }) {
      const items = bound(review.items, limit.value);
      const lines = [
        renderHeading("Change review", color),
        "",
        renderFields(
          [
            ["Base", review.base ?? "working tree"],
            riskLine(review.overallRisk, color),
            ["Changed files", String(review.items.length)],
            ["Affected files", String(review.totalAffectedFiles)],
          ],
          color,
        ),
        "",
        renderTable({
          columns: [
            { header: "CHANGED FILE", flex: true },
            { header: "RISK", align: "right" },
            { header: "AFFECTS", align: "right" },
            { header: "TESTS", align: "right" },
          ],
          rows: items.items.map((item) => [
            { text: item.path },
            scoreCell(item.risk),
            { text: String(item.affectedFilesCount) },
            { text: String(item.testsLikelyAffected.length) },
          ]),
          color,
          width,
        }),
      ];

      const note = truncationNote(items, "changed files");
      if (note) lines.push(paint(note, "dim", color));
      return lines.join("\n");
    },
  });
};

export const safeDeleteCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const resolved = target(context);
  if (!resolved.ok) return resolved;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.safeDelete(resolved.value);
  if (!report.ok) return report;

  const result = report.value;

  return ok({
    data: result,
    // Unsafe is the finding. `prism safe-delete x --fail-on any` in a cleanup
    // script should stop when something still depends on the file.
    findings: !result.safe,
    human({ color, width }) {
      const blockers = bound(result.blockers, limit.value);
      const lines = [
        renderHeading(`Safe delete: ${result.origin.id}`, color),
        "",
        result.safe
          ? paint("Safe to delete — nothing depends on it.", "green", color)
          : paint(
              `Not safe — ${plural(result.blockers.length, "file")} still depend${
                result.blockers.length === 1 ? "s" : ""
              } on it.`,
              "red",
              color,
            ),
      ];

      if (blockers.items.length > 0) {
        lines.push(
          "",
          renderTable({
            columns: [{ header: "BLOCKED BY", flex: true }, { header: "WHY" }],
            rows: blockers.items.map((item) => [
              { text: item.path },
              { text: item.reason },
            ]),
            color,
            width,
          }),
        );
        const note = truncationNote(blockers, "blockers");
        if (note) lines.push(paint(note, "dim", color));
      }

      if (result.orphans.length > 0) {
        lines.push(
          "",
          renderHeading(
            `${plural(result.orphans.length, "file")} left unreachable`,
            color,
          ),
          ...result.orphans.slice(0, limit.value).map((path) => `  ${path}`),
        );
      }

      return lines.join("\n");
    },
  });
};

export const renameCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const resolved = target(context);
  if (!resolved.ok) return resolved;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const newName = context.args.positionals[1];
  const report = await opened.value.renameImpact({
    ...resolved.value,
    ...(newName === undefined ? {} : { newName }),
  });
  if (!report.ok) return report;

  const rename = report.value;

  return ok({
    data: rename,
    human({ color, width }) {
      const sites = bound(rename.editSites, limit.value);
      const lines = [
        renderHeading(
          `Rename impact: ${rename.origin.id}${rename.newName ? ` → ${rename.newName}` : ""}`,
          color,
        ),
        "",
        renderFields(
          [
            ["Edit sites", String(rename.editSites.length)],
            ["Affected files", String(rename.affectedFiles.length)],
            ["Breaking-change hints", String(rename.breakingChanges.length)],
          ],
          color,
        ),
        "",
        paint("This is a report. Nothing is written.", "dim", color),
      ];

      if (sites.items.length > 0) {
        lines.push(
          "",
          renderTable({
            columns: [
              { header: "EDIT", flex: true },
              { header: "REFS", align: "right" },
            ],
            rows: sites.items.map((site) => [
              { text: site.path },
              { text: String(site.count) },
            ]),
            color,
            width,
          }),
        );
        const note = truncationNote(sites, "edit sites");
        if (note) lines.push(paint(note, "dim", color));
      }

      return lines.join("\n");
    },
  });
};

export const testImpactCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;
  const failOn = parseFailOnCount(context.args.option("failOn"));
  if (!failOn.ok) return failOn;

  const resolved = target(context);
  if (!resolved.ok) return resolved;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.testImpact(resolved.value);
  if (!report.ok) return report;

  const impact = report.value;

  return ok({
    data: impact,
    findings: failOn.value !== undefined && impact.tests.length >= failOn.value,
    human({ color, width }) {
      if (impact.tests.length === 0) {
        return wrap(
          `No tests reach ${impact.origin.id}. That is either good isolation or missing coverage — Prism cannot tell which.`,
          width,
        ).join("\n");
      }

      const tests = bound(impact.tests, limit.value);
      const lines = [
        renderHeading(
          `${plural(impact.tests.length, "test file")} reach ${impact.origin.id}`,
          color,
        ),
        "",
        renderTable({
          columns: [
            { header: "TEST", flex: true },
            { header: "DEPTH", align: "right" },
          ],
          rows: tests.items.map((item) => [
            { text: item.path },
            { text: String(item.depth) },
          ]),
          color,
          width,
        }),
      ];

      const note = truncationNote(tests, "tests");
      if (note) lines.push(paint(note, "dim", color));
      return lines.join("\n");
    },
  });
};
