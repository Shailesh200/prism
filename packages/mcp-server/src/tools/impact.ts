/**
 * Impact tools (M-026 blast radius, extended in M-027).
 *
 * These are the tools that answer "is this change safe?", which makes their
 * descriptions load-bearing: an agent that does not call them before editing
 * will not know what it broke.
 */

import { type PrismError, type Result, ok } from "@prism/shared";
import { z } from "zod";
import { allWorkspaceRelative, toWorkspaceRelative } from "../paths.js";
import { defineTool, type ToolContext } from "../tool-registry.js";

/** Every impact tool names its target the same way. */
const target = {
  kind: z
    .enum(["file", "symbol"])
    .describe("Whether `id` names a file or a symbol."),
  id: z
    .string()
    .min(1)
    .describe(
      "Workspace-relative file path, or symbol name as returned by find_symbol.",
    ),
  path: z
    .string()
    .min(1)
    .optional()
    .describe("File declaring the symbol, when kind is 'symbol'."),
};

type TargetArgs = {
  kind: "file" | "symbol";
  id: string;
  path?: string | undefined;
};

/** The shape Core's impact methods take. */
type ImpactTarget = {
  readonly kind: "file" | "symbol";
  readonly id: string;
  readonly path?: string;
};

/**
 * File targets are paths and must resolve inside the workspace; symbol targets
 * are names, not paths, so for those only `path` is checked.
 */
function resolveTarget(
  { workspaceRoot }: ToolContext,
  args: TargetArgs,
): Result<ImpactTarget, PrismError> {
  if (args.kind === "file") {
    const id = toWorkspaceRelative(workspaceRoot, args.id);
    if (!id.ok) return id;
    return ok({ kind: "file", id: id.value });
  }

  if (args.path === undefined) {
    return ok({ kind: "symbol", id: args.id });
  }

  const path = toWorkspaceRelative(workspaceRoot, args.path);
  if (!path.ok) return path;
  return ok({ kind: "symbol", id: args.id, path: path.value });
}

export const blastRadius = defineTool({
  name: "blast_radius",
  title: "Blast radius",
  description:
    "What depends on a file or symbol, and how risky changing it is: direct and transitive dependents, confidence lanes, evidence and a risk band. Call this before editing or deleting code you did not write. Use intent 'delete' when removing rather than modifying.",
  inputSchema: {
    ...target,
    intent: z
      .enum(["edit", "delete"])
      .optional()
      .describe(
        "Emphasis. 'delete' weighs orphaned code more heavily. Default 'edit'.",
      ),
  },
  async call(context, args) {
    const resolved = resolveTarget(context, args);
    if (!resolved.ok) return resolved;
    return context.workspace.blastRadius({
      ...resolved.value,
      ...(args.intent ? { intent: args.intent } : {}),
    });
  },
});

export const safeDelete = defineTool({
  name: "safe_delete",
  title: "Safe delete",
  description:
    "Whether a file or symbol can be deleted safely: blockers that still depend on it, and files that would be orphaned if it went. A report only — Prism never deletes anything. Prefer this over blast_radius when the question is specifically about removal.",
  inputSchema: target,
  async call(context, args) {
    const resolved = resolveTarget(context, args);
    if (!resolved.ok) return resolved;
    return context.workspace.safeDelete(resolved.value);
  },
});

export const renameImpact = defineTool({
  name: "rename_impact",
  title: "Rename impact",
  description:
    "Every edit site a rename would touch, plus breaking-change hints for public surface. Use before renaming an exported symbol or moving a file. A report only — Prism never edits.",
  inputSchema: {
    ...target,
    newName: z
      .string()
      .min(1)
      .optional()
      .describe("Proposed new name, to sharpen the hints."),
  },
  async call(context, args) {
    const resolved = resolveTarget(context, args);
    if (!resolved.ok) return resolved;
    return context.workspace.renameImpact({
      ...resolved.value,
      ...(args.newName ? { newName: args.newName } : {}),
    });
  },
});

export const testImpact = defineTool({
  name: "test_impact",
  title: "Test impact",
  description:
    "Which test files transitively cover a change target — the tests worth running after touching it. Prism reports which tests are relevant; it does not run them.",
  inputSchema: target,
  async call(context, args) {
    const resolved = resolveTarget(context, args);
    if (!resolved.ok) return resolved;
    return context.workspace.testImpact(resolved.value);
  },
});

export const breakingChangeHints = defineTool({
  name: "breaking_change_hints",
  title: "Breaking change hints",
  description:
    "Heuristic hints about what a change to this target could break for consumers — exported surface, widely imported modules, public entrypoints. Heuristic by design: treat as prompts to check, not as findings.",
  inputSchema: target,
  async call(context, args) {
    const resolved = resolveTarget(context, args);
    if (!resolved.ok) return resolved;
    return context.workspace.breakingChangeHints(resolved.value);
  },
});

export const reviewChanges = defineTool({
  name: "review_changes",
  title: "Review changes",
  description:
    "Review a set of changed paths in one call: blast radius, test impact and breaking-change hints per path, rolled up with an overall risk band. Use for 'review my branch' rather than calling the per-file tools repeatedly.",
  inputSchema: {
    paths: z
      .array(z.string().min(1))
      .min(1)
      .describe("Workspace-relative paths that changed."),
    base: z
      .string()
      .min(1)
      .optional()
      .describe("Diff base label to stamp on the report (display only)."),
  },
  async call({ workspace, workspaceRoot }, args) {
    const paths = allWorkspaceRelative(workspaceRoot, args.paths);
    if (!paths.ok) return paths;
    return workspace.reviewChanges({
      paths: paths.value,
      ...(args.base ? { base: args.base } : {}),
    });
  },
});

export const IMPACT_TOOLS = [
  blastRadius,
  safeDelete,
  renameImpact,
  testImpact,
  breakingChangeHints,
  reviewChanges,
];
