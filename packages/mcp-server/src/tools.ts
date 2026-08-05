/**
 * The tools an agent can call (M-026).
 *
 * Four here, deliberately: DNA, health, map and blast radius cover "what is
 * this repository", "how healthy is it", "how is it laid out" and "what breaks
 * if I touch this" — the four questions an agent actually has before editing
 * code. The remaining breadth is M-027.
 *
 * Descriptions are written for a model choosing between tools, not for a
 * changelog. Each says what it answers and what it costs.
 */

import { z } from "zod";
import { defineTool, type ToolDefinition } from "./tool-registry.js";

const packageId = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Optional package id to scope the answer within a monorepo. Omit for the whole workspace.",
  );

const repositoryDna = defineTool({
  name: "prism_repository_dna",
  title: "Repository DNA",
  description:
    "Identify what a repository *is*: detected languages, frameworks, architecture style, domains and the evidence behind each. Start here when you know nothing about a codebase. Reads the local index; no network.",
  inputSchema: {},
  async call(workspace) {
    return workspace.getDna();
  },
});

const repositoryHealth = defineTool({
  name: "prism_repository_health",
  title: "Repository health",
  description:
    "Score repository health (0-100) with the per-factor breakdown behind the score. Use to judge whether a codebase is in good shape, or to find which factor is dragging it down. Reads the local index; no network.",
  inputSchema: {},
  async call(workspace) {
    return workspace.getHealth();
  },
});

const repositoryMap = defineTool({
  name: "prism_repository_map",
  title: "Repository map",
  description:
    "Return the repository's structural map at a zoom level: nodes, edges and regions. Use to orient yourself in an unfamiliar codebase or to find where a concern lives. 'repo' and 'package' zooms are small; 'file' and 'symbol' can be large on big repositories.",
  inputSchema: {
    zoom: z
      .enum(["repo", "package", "feature", "file", "symbol"])
      .optional()
      .describe("Detail level. Defaults to the Core default zoom."),
    layers: z
      .array(z.string().min(1))
      .optional()
      .describe("Optional overlay layer ids to include."),
  },
  async call(workspace, args) {
    return workspace.getRepositoryMap({
      ...(args.zoom ? { zoom: args.zoom } : {}),
      ...(args.layers ? { layers: args.layers } : {}),
    });
  },
});

const blastRadius = defineTool({
  name: "prism_blast_radius",
  title: "Blast radius",
  description:
    "Given a file or symbol, return what depends on it and how risky changing it is — direct and transitive dependents, confidence lanes and evidence. Call this *before* editing or deleting anything you did not write. Reads the local index; no network.",
  inputSchema: {
    kind: z
      .enum(["file", "symbol"])
      .describe("Whether `id` names a file or a symbol."),
    id: z
      .string()
      .min(1)
      .describe(
        "Workspace-relative file path, or symbol id as returned by the map or search tools.",
      ),
    path: z
      .string()
      .min(1)
      .optional()
      .describe("File path containing the symbol, when `kind` is 'symbol'."),
    intent: z
      .enum(["edit", "delete"])
      .optional()
      .describe(
        "Emphasis. 'delete' weighs orphaned code more heavily. Defaults to 'edit'.",
      ),
  },
  async call(workspace, args) {
    return workspace.blastRadius({
      kind: args.kind,
      id: args.id,
      ...(args.path ? { path: args.path } : {}),
      ...(args.intent ? { intent: args.intent } : {}),
    });
  },
});

/**
 * Adopted from the orphan M-044 left behind. It was already a Core-backed
 * contract; it only ever lacked a server to register it against.
 */
const backendReport = defineTool({
  name: "prism_backend_report",
  title: "Backend report",
  description:
    "Route-granular backend intelligence: HTTP endpoints, auth posture, data layer, environment variables and background jobs. Use when the question is about the server side specifically. Reads the local index; no network.",
  inputSchema: { packageId },
  async call(workspace, args) {
    return workspace.getBackendReport(
      args.packageId ? { packageId: args.packageId } : undefined,
    );
  },
});

/** Every tool the M-026 server exposes. */
export const TOOLS: readonly ToolDefinition<never>[] = [
  repositoryDna,
  repositoryHealth,
  repositoryMap,
  blastRadius,
  backendReport,
] as unknown as readonly ToolDefinition<never>[];
