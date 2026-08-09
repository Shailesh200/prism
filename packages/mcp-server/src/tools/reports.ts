/**
 * Health and domain report tools (M-027).
 *
 * Each of these is a whole report rather than a thin slice, deliberately: the
 * Master Plan listed `engineering_entropy`, `technical_debt`, `hotspots` and
 * `knowledge_decay` as four tools, but they are four views of one computation.
 * Four tools would mean an agent paying for the same analysis four times and
 * choosing between near-identical descriptions.
 */

import { PrismErrorCode, err, ok, prismError } from "@repo-prism/shared";
import { z } from "zod";
import { boundList, limitInput } from "../limits.js";
import { toWorkspaceRelative } from "../paths.js";
import { defineTool } from "../tool-registry.js";

const packageId = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Scope to one package in a monorepo. Omit for the whole workspace.",
  );

export const engineeringHealth = defineTool({
  name: "engineering_health",
  title: "Engineering health",
  description:
    "The deep engineering view: hotspots, churn, complexity, ownership concentration, knowledge decay and debt indicators in one report. Use when asked to find what needs attention. Git-derived sections fail soft on repositories without history. For the single headline number use repository_health.",
  inputSchema: {},
  async call({ workspace }) {
    return workspace.getEngineeringHealth();
  },
});

export const healthHistory = defineTool({
  name: "health_history",
  title: "Health history",
  description:
    "Health score over time from stored index snapshots and optional git backfill. Use to answer 'is this getting better or worse?'. Points carry provenance: backfilled points are estimated from history, not measured at the time, and say so.",
  inputSchema: {
    // Named `maxPoints` rather than `limit` on purpose: `limit` is the pack's
    // signal that a tool returns the BoundedList envelope, and this one returns
    // a report. Core narrows the query itself, so there is nothing to truncate.
    maxPoints: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe("Maximum history points to return, most recent first."),
  },
  async call({ workspace }, args) {
    return workspace.getHealthHistory(
      args.maxPoints === undefined ? undefined : { limit: args.maxPoints },
    );
  },
});

export const exploreCode = defineTool({
  name: "explore_code",
  title: "Explore code",
  description:
    "Everything about one file or symbol in a single call: usages, ownership, related and similar code, and a change timeline. Usages are bounded (default 50) via a nested envelope so large files do not drown the response. Use when asked to understand a specific thing rather than the repository as a whole.",
  inputSchema: {
    kind: z.enum(["file", "symbol"]).describe("What the target is."),
    path: z
      .string()
      .min(1)
      .optional()
      .describe("Workspace-relative path. Required when kind is 'file'."),
    name: z
      .string()
      .min(1)
      .optional()
      .describe("Symbol name. Required when kind is 'symbol'."),
    start: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Declaration start offset, to disambiguate a symbol."),
    limit: limitInput,
  },
  async call({ workspace, workspaceRoot }, args) {
    const path = args.path
      ? toWorkspaceRelative(workspaceRoot, args.path)
      : undefined;
    if (path && !path.ok) return path;

    const report =
      args.kind === "file"
        ? !path?.ok
          ? err(
              prismError(
                PrismErrorCode.VALIDATION,
                "A 'file' target requires `path`",
              ),
            )
          : await workspace.exploreCode({ kind: "file", path: path.value })
        : !args.name
          ? err(
              prismError(
                PrismErrorCode.VALIDATION,
                "A 'symbol' target requires `name`",
              ),
            )
          : await workspace.exploreCode({
              kind: "symbol",
              name: args.name,
              ...(path?.ok ? { path: path.value } : {}),
              ...(args.start === undefined ? {} : { start: args.start }),
            });

    if (!report.ok) return report;
    const usages = boundList(report.value.usages, args.limit);
    return ok({
      ...report.value,
      usages: usages.items,
      usagesEnvelope: usages,
    });
  },
});

export const backendReport = defineTool({
  name: "backend_report",
  title: "Backend report",
  description:
    "Route-granular backend intelligence: HTTP endpoints, auth posture, data layer, environment variables and background jobs. Use when the question is specifically about the server side. Static heuristics over Express, Nest and Fastify — nothing is executed.",
  inputSchema: { packageId },
  async call({ workspace }, args) {
    return workspace.getBackendReport(
      args.packageId ? { packageId: args.packageId } : undefined,
    );
  },
});

export const testingReport = defineTool({
  name: "testing_report",
  title: "Testing report",
  description:
    "Test structure and, when coverage artifacts are already on disk, coverage. Use to judge how well tested an area is. Prism reads existing artifacts; it never runs your tests.",
  inputSchema: {},
  async call({ workspace }) {
    return workspace.getTestingReport();
  },
});

export const securityReport = defineTool({
  name: "security_report",
  title: "Security report",
  description:
    "Left-shift security posture: which tooling is configured, which fundamental checks are present or missing. A checklist against local configuration, not a vulnerability scan — it will not find CVEs and does not claim to.",
  inputSchema: {},
  async call({ workspace }) {
    return workspace.getSecurityReport();
  },
});

export const REPORT_TOOLS = [
  engineeringHealth,
  healthHistory,
  exploreCode,
  backendReport,
  testingReport,
  securityReport,
];
