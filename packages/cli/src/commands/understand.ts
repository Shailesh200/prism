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
import {
  gradeStyle,
  plural,
  qualityCell,
  renderTable,
  wrap,
} from "../table.js";
import { toWorkspaceRelative } from "../target.js";
import {
  bound,
  meetsThreshold,
  parseFailOn,
  parseLimit,
  parseZoom,
  truncationNote,
} from "../thresholds.js";

export const healthCommand: CommandHandler = async (context) => {
  const failOn = parseFailOn(context.args.option("failOn"));
  if (!failOn.ok) return failOn;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.getHealth();
  if (!report.ok) return report;

  const health = report.value;

  // Health is a quality score where 100 is good, while a risk band treats 100
  // as bad. Inverting before banding keeps `--fail-on high` meaning "this is
  // in a bad state" on both kinds of command.
  const risk = 100 - health.score;

  return ok({
    data: health,
    findings: meetsThreshold(risk, failOn.value),
    human({ color, width }) {
      const rows = health.factors.map((factor) => [
        { text: factor.label },
        qualityCell(factor.score),
        { text: factor.note ?? "" },
      ]);

      return [
        renderHeading("Repository health", color),
        "",
        renderFields(
          [
            [
              "Score",
              `${Math.round(health.score)}/100  ${paint(
                health.grade,
                gradeStyle(health.grade),
                color,
              )}`,
            ],
          ],
          color,
        ),
        "",
        renderTable({
          columns: [
            { header: "FACTOR" },
            { header: "SCORE", align: "right" },
            { header: "DETAIL", flex: true },
          ],
          rows,
          color,
          width,
        }),
      ].join("\n");
    },
  });
};

export const mapCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const zoom = parseZoom(context.args.option("zoom"));
  if (!zoom.ok) return zoom;

  const map = opened.value.getRepositoryMap(
    zoom.value ? { zoom: zoom.value } : {},
  );
  if (!map.ok) return map;

  const model = map.value;

  return ok({
    data: model,
    human({ color, width }) {
      const clusters = bound(model.clusters, limit.value);
      const rows = clusters.items.map((cluster) => [
        { text: cluster.label },
        { text: String(cluster.memberNodeIds.length) },
      ]);

      const lines = [
        renderHeading("Repository map", color),
        "",
        renderFields(
          [
            ["Zoom", model.zoom],
            ["Nodes", String(model.graph.nodes.length)],
            ["Edges", String(model.graph.edges.length)],
            ["Clusters", String(model.clusters.length)],
            ["Landmarks", String(model.landmarks.length)],
            ["Layers", model.activeLayerIds.join(", ") || "none"],
          ],
          color,
          width,
        ),
        "",
        paint(model.clusteringNote, "dim", color),
      ];

      if (rows.length > 0) {
        lines.push(
          "",
          renderTable({
            columns: [
              { header: "CLUSTER", flex: true },
              { header: "MEMBERS", align: "right" },
            ],
            rows,
            color,
            width,
          }),
        );
        const note = truncationNote(clusters, "clusters");
        if (note) lines.push(paint(note, "dim", color));
      }

      return lines.join("\n");
    },
  });
};

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

export const stackCommand: CommandHandler = async (context) => {
  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.getStackProfile();
  if (!report.ok) return report;

  const stack = report.value;

  return ok({
    data: stack,
    human({ color, width }) {
      const lines = [
        renderHeading("Stack profile", color),
        "",
        ...wrap(stack.summary, width),
        "",
        renderFields(
          [
            ["Domains", stack.domains.join(", ") || "none detected"],
            ["Personas", stack.personas.join(", ") || "none detected"],
            ["Packages", String(stack.packages.length)],
          ],
          color,
          width,
        ),
      ];

      if (stack.signals.length > 0) {
        lines.push(
          "",
          renderTable({
            columns: [
              { header: "SIGNAL", flex: true },
              { header: "DOMAIN" },
              { header: "CONFIDENCE", align: "right" },
            ],
            rows: stack.signals.map((signal) => [
              { text: signal.id },
              { text: signal.domain },
              { text: `${Math.round(signal.confidence * 100)}%` },
            ]),
            color,
            width,
          }),
        );
      }

      return lines.join("\n");
    },
  });
};

export const featuresCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const result = opened.value.listFeatures();
  if (!result.ok) return result;

  const features = bound(result.value, limit.value);

  return ok({
    data: {
      features: features.items,
      totalCount: features.totalCount,
      truncated: features.truncated,
    },
    human({ color, width }) {
      if (features.items.length === 0) {
        return wrap(
          "No features inferred. Feature grouping is heuristic and needs a recognisable folder or naming structure.",
          width,
        ).join("\n");
      }

      const lines = [
        renderHeading(plural(features.totalCount, "inferred feature"), color),
        "",
        renderTable({
          columns: [
            { header: "FEATURE", flex: true },
            { header: "FILES", align: "right" },
            { header: "CONFIDENCE", align: "right" },
          ],
          rows: features.items.map((feature) => [
            { text: feature.name },
            { text: String(feature.memberFiles.length) },
            // Confidence reads as a percentage rather than a band word: a
            // feature is a heuristic guess, and "72%" says that more honestly
            // than "Moderate" does.
            {
              ...qualityCell(feature.confidence * 100),
              text: `${Math.round(feature.confidence * 100)}%`,
            },
          ]),
          color,
          width,
        }),
      ];

      const note = truncationNote(features, "features");
      if (note) lines.push(paint(note, "dim", color));
      return lines.join("\n");
    },
  });
};

export const landmarksCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const result = opened.value.listLandmarks();
  if (!result.ok) return result;

  const landmarks = bound(result.value, limit.value);

  return ok({
    data: {
      landmarks: landmarks.items,
      totalCount: landmarks.totalCount,
      truncated: landmarks.truncated,
    },
    human({ color, width }) {
      if (landmarks.items.length === 0) return "No landmarks found.";

      const lines = [
        renderHeading("Landmarks", color),
        "",
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
      ];

      const note = truncationNote(landmarks, "landmarks");
      if (note) lines.push(paint(note, "dim", color));
      return lines.join("\n");
    },
  });
};
