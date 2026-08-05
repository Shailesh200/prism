/**
 * "How is this wired together?" (M-029).
 *
 * Graph and navigation commands. These can return the most data of anything in
 * the CLI, so every one of them is bounded and every one says what it cut.
 */

import { ok, PrismErrorCode, err, prismError } from "@prism/shared";
import { paint, renderFields, renderHeading } from "../output.js";
import type { CommandHandler } from "../runtime.js";
import { plural, renderTable, wrap } from "../table.js";

/**
 * Graph node ids are namespaced (`file:src/x.ts`, `pkg:@prism/core`). The
 * prefix disambiguates inside the graph and is noise in a terminal, where
 * every row of a given table is the same kind of thing anyway.
 */
function nodeLabel(id: string): string {
  const colon = id.indexOf(":");
  return colon === -1 ? id : id.slice(colon + 1);
}
import { toWorkspaceRelative } from "../target.js";
import {
  bound,
  parseFailOnCount,
  parseLimit,
  truncationNote,
} from "../thresholds.js";

export const depsCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const packages = context.args.flag("packages");
  const graph = opened.value.getDependencyGraph(
    packages ? { packageAggregation: true } : {},
  );
  if (!graph.ok) return graph;

  const snapshot = graph.value;

  // Out-degree per node: the question "what does this depend on?" asked of the
  // whole graph at once. Printing every edge would be unreadable and mostly
  // uninformative.
  const outDegree = new Map<string, number>();
  for (const edge of snapshot.edges) {
    outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
  }
  const inDegree = new Map<string, number>();
  for (const edge of snapshot.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const ranked = snapshot.nodes
    .map((node) => ({
      id: node.id,
      label: node.label ?? nodeLabel(node.id),
      in: inDegree.get(node.id) ?? 0,
      out: outDegree.get(node.id) ?? 0,
    }))
    .sort((a, b) => b.in + b.out - (a.in + a.out));

  return ok({
    data: snapshot,
    human({ color, width }) {
      const top = bound(ranked, limit.value);
      const lines = [
        renderHeading(
          packages ? "Package dependencies" : "File dependencies",
          color,
        ),
        "",
        renderFields(
          [
            ["Nodes", String(snapshot.nodes.length)],
            ["Edges", String(snapshot.edges.length)],
          ],
          color,
          width,
        ),
        "",
        paint("Most connected, by total degree:", "dim", color),
        renderTable({
          columns: [
            { header: "NODE", flex: true },
            { header: "IN", align: "right" },
            { header: "OUT", align: "right" },
          ],
          rows: top.items.map((node) => [
            { text: node.label },
            { text: String(node.in) },
            { text: String(node.out) },
          ]),
          color,
          width,
        }),
      ];

      const note = truncationNote(top, "nodes");
      if (note) lines.push(paint(note, "dim", color));
      return lines.join("\n");
    },
  });
};

export const cyclesCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;
  const failOn = parseFailOnCount(context.args.option("failOn"));
  if (!failOn.ok) return failOn;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const result = opened.value.getCycles(
    context.args.flag("packages") ? { packageAggregation: true } : {},
  );
  if (!result.ok) return result;

  const cycles = bound(result.value, limit.value);

  return ok({
    data: {
      cycles: cycles.items,
      totalCount: cycles.totalCount,
      truncated: cycles.truncated,
    },
    findings: failOn.value !== undefined && cycles.totalCount >= failOn.value,
    human({ color }) {
      if (cycles.totalCount === 0) return "No import cycles.";

      const lines = [
        renderHeading(plural(cycles.totalCount, "import cycle"), color),
        "",
      ];

      for (const [index, cycle] of cycles.items.entries()) {
        lines.push(paint(`${index + 1}. ${cycle.length} files`, "dim", color));
        // The loop closes back on the first file, so repeating it at the end
        // makes the cycle visible rather than something to infer.
        for (const node of [...cycle, cycle[0]]) {
          lines.push(`   ${nodeLabel(node ?? "")}`);
        }
        lines.push("");
      }

      const note = truncationNote(cycles, "cycles");
      if (note) lines.push(paint(note, "dim", color));
      return lines.join("\n").trimEnd();
    },
  });
};

export const symbolCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const [name] = context.args.positionals;
  const opened = await context.open();
  if (!opened.ok) return opened;

  const inFile = context.args.option("in");
  const path = inFile
    ? toWorkspaceRelative(context.workspace.path, context.cwd, inFile)
    : undefined;
  if (path && !path.ok) return path;

  const kind = context.args.option("kind");
  const result = opened.value.findSymbol({
    name: name ?? "",
    ...(path?.ok ? { path: path.value } : {}),
    ...(kind === undefined ? {} : { kind }),
  });
  if (!result.ok) return result;

  const hits = bound(result.value, limit.value);

  return ok({
    data: {
      symbols: hits.items,
      totalCount: hits.totalCount,
      truncated: hits.truncated,
    },
    human({ color, width }) {
      if (hits.items.length === 0) return `No symbol named '${name}'.`;

      const lines = [
        renderHeading(plural(hits.totalCount, "match", "matches"), color),
        "",
        renderTable({
          columns: [
            { header: "SYMBOL" },
            { header: "KIND" },
            { header: "EXPORTED" },
            { header: "PATH", flex: true },
          ],
          rows: hits.items.map((hit) => [
            { text: hit.name },
            { text: hit.kind },
            { text: hit.exported ? "yes" : "no" },
            { text: hit.path },
          ]),
          color,
          width,
        }),
      ];

      const note = truncationNote(hits, "matches");
      if (note) lines.push(paint(note, "dim", color));
      return lines.join("\n");
    },
  });
};

export const refsCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const [name] = context.args.positionals;
  const opened = await context.open();
  if (!opened.ok) return opened;

  const inFile = context.args.option("in");
  const path = inFile
    ? toWorkspaceRelative(context.workspace.path, context.cwd, inFile)
    : undefined;
  if (path && !path.ok) return path;

  const result = opened.value.findReferences({
    name: name ?? "",
    ...(path?.ok ? { path: path.value } : {}),
  });
  if (!result.ok) return result;

  const hits = bound(result.value, limit.value);

  return ok({
    data: {
      references: hits.items,
      totalCount: hits.totalCount,
      truncated: hits.truncated,
    },
    human({ color, width }) {
      if (hits.items.length === 0) {
        return wrap(
          `No resolved references to '${name}'. If it is exported from a package entry point, callers outside this workspace will not appear.`,
          width,
        ).join("\n");
      }

      const lines = [
        renderHeading(plural(hits.totalCount, "reference"), color),
        "",
        renderTable({
          columns: [
            { header: "PATH", flex: true },
            { header: "KIND" },
            { header: "OFFSET", align: "right" },
          ],
          rows: hits.items.map((hit) => [
            { text: hit.path },
            { text: hit.kind },
            { text: String(hit.start) },
          ]),
          color,
          width,
        }),
      ];

      const note = truncationNote(hits, "references");
      if (note) lines.push(paint(note, "dim", color));
      return lines.join("\n");
    },
  });
};

export const routeCommand: CommandHandler = async (context) => {
  const [from, to] = context.args.positionals;
  if (from === undefined || to === undefined) {
    return err(
      prismError(PrismErrorCode.VALIDATION, "route needs a <from> and a <to>"),
    );
  }

  const fromPath = toWorkspaceRelative(
    context.workspace.path,
    context.cwd,
    from,
  );
  if (!fromPath.ok) return fromPath;
  const toPath = toWorkspaceRelative(context.workspace.path, context.cwd, to);
  if (!toPath.ok) return toPath;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const maxAlternatives = context.args.option("alternatives");
  const result = opened.value.findRoute({
    from: { kind: "file", path: fromPath.value },
    to: { kind: "file", path: toPath.value },
    ...(maxAlternatives === undefined
      ? {}
      : { maxAlternatives: Number.parseInt(maxAlternatives, 10) }),
  });
  if (!result.ok) return result;

  const routes = result.value;

  return ok({
    data: routes,
    human({ color, width }) {
      if (routes.empty || routes.routes.length === 0) {
        return wrap(
          `No dependency path from ${fromPath.value} to ${toPath.value}. They are not connected — which is itself an answer.`,
          width,
        ).join("\n");
      }

      const lines = [
        renderHeading(plural(routes.routes.length, "route", "routes"), color),
        "",
      ];

      for (const [index, route] of routes.routes.entries()) {
        lines.push(
          paint(`${index + 1}. ${plural(route.length, "hop")}`, "dim", color),
        );
        for (const [depth, hop] of route.hops.entries()) {
          lines.push(`   ${"  ".repeat(depth)}${nodeLabel(hop)}`);
        }
        lines.push("");
      }

      return lines.join("\n").trimEnd();
    },
  });
};
