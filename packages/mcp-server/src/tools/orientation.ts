/**
 * "What is this repository and how is it laid out?" — the tools an agent
 * reaches for before it knows anything (M-026, extended in M-027 / M-058).
 */

import { access } from "node:fs/promises";
import { join } from "node:path";
import { CONSENT_PURPOSES, MAP_ZOOM_LEVELS, ok } from "@repo-prism/shared";
import { z } from "zod";
import { boundList, limitInput } from "../limits.js";
import { toWorkspaceRelative } from "../paths.js";
import { defineTool } from "../tool-registry.js";

export const repositoryDna = defineTool({
  name: "repository_dna",
  title: "Repository DNA",
  description:
    "Identify what a repository *is*: detected languages, frameworks, package manager, architecture hints, test runners and ranked domains, each with the evidence behind it. Start here when you know nothing about a codebase. Local index only; no network.",
  inputSchema: {},
  async call({ workspace }) {
    return workspace.getDna();
  },
});

export const repositoryHealth = defineTool({
  name: "repository_health",
  title: "Repository health",
  description:
    "Score overall repository health from 0-100 with the per-factor breakdown behind the score. Includes graphCoveragePct (share of inventory files in the TS/JS dependency graph) and a 'TS/JS import coupling' factor. Use to judge whether a codebase is in good shape or to find which factor drags it down. For the deeper engineering view (hotspots, churn, ownership, debt) call engineering_health instead.",
  inputSchema: {},
  async call({ workspace }) {
    return workspace.getHealth();
  },
});

export const repositoryMap = defineTool({
  name: "repository_map",
  title: "Repository map",
  description:
    "Return the repository's structural map at a zoom level: nodes, edges and regions. Use to orient yourself or to find where a concern lives. Defaults to 'package' zoom (bounded). 'file' and 'symbol' can be very large on a big repository, so prefer the coarsest zoom that answers your question.",
  inputSchema: {
    zoom: z
      .enum(MAP_ZOOM_LEVELS)
      .optional()
      .describe("Detail level. Defaults to 'package'."),
    layers: z
      .array(z.string().min(1))
      .optional()
      .describe("Optional overlay layer ids to include."),
  },
  async call({ workspace }, args) {
    return workspace.getRepositoryMap({
      zoom: args.zoom ?? "package",
      ...(args.layers ? { layers: args.layers } : {}),
    });
  },
});

export const repositoryOverview = defineTool({
  name: "repository_overview",
  title: "Repository overview",
  description:
    "The dashboard summary in one call: totals, coupling density and band, the largest regions with health scores, the most connected nodes (with map kind), and recent commit activity. Use when you want a single orienting snapshot rather than four separate calls. Region scores are null where there is no evidence — that means 'not measured', not 'zero'.",
  inputSchema: {
    zoom: z
      .enum(MAP_ZOOM_LEVELS)
      .optional()
      .describe(
        "Map zoom for graph-derived fields. Defaults to feature; echoed on the response.",
      ),
    activityDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe("Commit-activity window in days (default 7)."),
  },
  async call({ workspace }, args) {
    return workspace.getOverviewModel({
      ...(args.zoom ? { zoom: args.zoom } : {}),
      ...(args.activityDays ? { activityDays: args.activityDays } : {}),
    });
  },
});

export const listPackages = defineTool({
  name: "list_packages",
  title: "List packages",
  description:
    "List the packages in a monorepo with their roots. Call this first in a monorepo so later tools can be scoped with packageId instead of returning the whole workspace.",
  inputSchema: { limit: limitInput },
  async call({ workspace }, args) {
    const result = await workspace.listPackages();
    if (!result.ok) return result;
    return { ok: true as const, value: boundList(result.value, args.limit) };
  },
});

export const stackProfile = defineTool({
  name: "stack_profile",
  title: "Stack profile",
  description:
    "Detected stack for the workspace or a single package: frameworks, runtimes, build tooling and the signals each was detected from. Use when you need to know what a package is built with before changing its configuration.",
  inputSchema: {
    packageId: z
      .string()
      .min(1)
      .optional()
      .describe("Scope to one package. Omit for the whole workspace."),
  },
  async call({ workspace }, args) {
    return workspace.getStackProfile(
      args.packageId ? { packageId: args.packageId } : undefined,
    );
  },
});

export const landmarks = defineTool({
  name: "landmarks",
  title: "Landmarks",
  description:
    "Named entrypoints, package roots and feature anchors — the places a human would open first. Use to pick a starting file in an unfamiliar repository.",
  inputSchema: { limit: limitInput },
  async call({ workspace }, args) {
    const result = workspace.listLandmarks();
    if (!result.ok) return result;
    return { ok: true as const, value: boundList(result.value, args.limit) };
  },
});

export const explainArea = defineTool({
  name: "explain_area",
  title: "Explain area",
  description:
    "Explain what a module or folder does: domain overlap, dependency in/out degree and local ownership. Use before editing an unfamiliar directory. For a single file target prefer explore_code (richer usages/ownership/timeline). Deterministic — derived from the index and local git, never generated prose.",
  inputSchema: {
    path: z
      .string()
      .min(1)
      .describe("Workspace-relative path to a file or directory."),
  },
  async call({ workspace, workspaceRoot }, args) {
    const path = toWorkspaceRelative(workspaceRoot, args.path);
    if (!path.ok) return path;
    return workspace.explainArea(path.value);
  },
});

export const workspaceStatus = defineTool({
  name: "workspace_status",
  title: "Workspace status",
  description:
    "Compact workspace readiness: path, whether an index is loaded, indexedAt, freshness, git availability, whether a .prism/cache directory exists, and dependency-graph node/edge counts. Call this when a previous tool failed or to confirm the session is ready before a review.",
  inputSchema: {},
  async call({ workspace, workspaceRoot }) {
    const status = workspace.status();
    const freshness = workspace.getIndexFreshness();
    const gitProbe = workspace.getChangedPaths();
    const dep = workspace.getDependencyGraph({ packageAggregation: true });

    let cachePresent = false;
    try {
      await access(join(workspaceRoot, ".prism"));
      cachePresent = true;
    } catch {
      cachePresent = false;
    }

    return ok({
      workspacePath: status.rootPath,
      indexed: status.lastIndexedAt !== null,
      indexedAt: status.lastIndexedAt,
      freshness: freshness.ok ? freshness.value : null,
      gitAvailable: gitProbe.ok,
      cachePresent,
      nodeCount: dep.ok ? dep.value.nodes.length : null,
      edgeCount: dep.ok ? dep.value.edges.length : null,
      coreVersion: status.coreVersion,
      apiLevel: status.apiLevel,
    });
  },
});

export const capabilities = defineTool({
  name: "capabilities",
  title: "Capabilities",
  description:
    "List every Core analysis capability and consent-gated integration with availability and a reason when unavailable. Use this to tell 'not supported by this build' apart from 'not consented / not exposed via MCP' — never guess why a network or build feature is missing.",
  inputSchema: {},
  async call({ workspace }) {
    const status = workspace.status();
    const caps = status.capabilities;
    const coreEntries = (
      Object.entries(caps) as [keyof typeof caps, boolean][]
    ).map(([id, available]) => ({
      id,
      available,
      ...(available
        ? {}
        : {
            reason:
              "Not enabled in this Core build (engine port missing or stub capabilities).",
          }),
    }));

    const DISPATCH_PURPOSES = new Set([
      "network.github-user",
      "network.linear",
      "network.jira",
      "network.slack",
      "network.notion",
      "network.google-calendar",
    ]);

    const consentEntries = CONSENT_PURPOSES.map((purpose) => ({
      id: purpose.id,
      available: false as const,
      reason: DISPATCH_PURPOSES.has(purpose.id)
        ? "Dispatch driver. Say “connect …” — Cursor shows Authenticate, Claude opens Prism Auth. Completing that grant is the human consent. Not a Core analysis API."
        : "Consent-gated and not available via MCP intelligence tools (ADR-0024). Grant consent in the IDE/CLI if you need this; agents cannot consent on the user's behalf for Core network APIs.",
      title: purpose.title,
      group: purpose.group,
    }));

    return ok({
      capabilities: [...coreEntries, ...consentEntries],
    });
  },
});

export const ORIENTATION_TOOLS = [
  repositoryDna,
  repositoryHealth,
  repositoryMap,
  repositoryOverview,
  listPackages,
  stackProfile,
  landmarks,
  explainArea,
  workspaceStatus,
  capabilities,
];
