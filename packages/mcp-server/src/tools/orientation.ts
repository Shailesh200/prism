/**
 * "What is this repository and how is it laid out?" — the tools an agent
 * reaches for before it knows anything (M-026, extended in M-027 / M-058).
 */

import { access } from "node:fs/promises";
import { ok } from "@repo-prism/shared";
import { workspaceCacheDir } from "@repo-prism/shared/prism-home";
import { z } from "zod";
import { boundList, limitInput } from "../limits.js";
import { toWorkspaceRelative } from "../paths.js";
import { defineTool } from "../tool-registry.js";

export const repositoryOverview = defineTool({
  name: "repository_overview",
  title: "Repository overview",
  description:
    "What this repository is, in one bounded call: languages, frameworks, package manager, test runners and ranked domains (dna), the detected stack, and the landmarks a human would open first (entrypoints, package roots). Start here when you know nothing about a codebase. Local index only; no network.",
  inputSchema: {
    packageId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Scope the stack to one package. Omit for the whole workspace.",
      ),
    limit: limitInput,
  },
  async call({ workspace }, args) {
    const dna = await workspace.getDna();
    if (!dna.ok) return dna;
    const stack = await workspace.getStackProfile(
      args.packageId ? { packageId: args.packageId } : undefined,
    );
    if (!stack.ok) return stack;
    const landmarks = workspace.listLandmarks();
    if (!landmarks.ok) return landmarks;
    return ok({
      dna: dna.value,
      stack: stack.value,
      landmarks: boundList(landmarks.value, args.limit),
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
    "Compact workspace readiness: path, whether an index is loaded, indexedAt, freshness, git availability, whether a Prism cache directory exists, and dependency-graph node/edge counts. Call this when a previous tool failed or to confirm the session is ready before a review.",
  inputSchema: {},
  async call({ workspace, workspaceRoot }) {
    const status = workspace.status();
    const freshness = workspace.getIndexFreshness();
    const gitProbe = workspace.getChangedPaths();
    const dep = workspace.getDependencyGraph({ packageAggregation: true });

    let cachePresent = false;
    try {
      await access(workspaceCacheDir(workspaceRoot));
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
    "List every Core analysis capability with availability and a reason when unavailable. Use this to tell 'not supported by this build' apart from a real failure.",
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

    return ok({
      capabilities: coreEntries,
    });
  },
});

export const ORIENTATION_TOOLS = [
  repositoryOverview,
  listPackages,
  explainArea,
  workspaceStatus,
  capabilities,
];
