/**
 * Data-backed lens checks (plan §5.3). Every result is computed from the
 * index, the working-tree diff and the receipt; no model is called. The
 * pure part (`evaluateLensChecks`) takes plain signals so it can be tested
 * without a repository; `gatherLensSignals` reads them from a workspace.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { packageRootFor } from "@repo-prism/checks";
import type { PrismWorkspace } from "@repo-prism/core";
import { recordEvent } from "@repo-prism/shared/events";
import {
  contentFingerprint,
  pathFingerprint,
} from "@repo-prism/shared/lens-store";

export { pathFingerprint };
import {
  isTestPath,
  offLimitReason,
  type ChangeReceipt,
  type LensCheckId,
  type LensDefinition,
  type LensFinding,
} from "@repo-prism/shared";

/** What the checks read. Paths are repo-relative. */
export type LensSignals = {
  readonly changed: readonly string[];
  /** File → lines the session added (whole file when untracked). */
  readonly addedLines: ReadonlyMap<string, readonly string[]>;
  /** Value and type import edges between files, with the specifier. */
  readonly edges: readonly {
    readonly from: string;
    readonly to: string;
    readonly source: string;
    readonly typeOnly: boolean;
  }[];
  /** Value-only import cycles (type-only edges already excluded, §4.1). */
  readonly valueCycles: readonly (readonly string[])[];
  /** Package root (repo-relative, "" for the root) of a file. */
  packageOf(path: string): string;
  /** Changed files whose added lines are new dependencies, per manifest. */
  readonly dependenciesAdded: readonly string[];
  /** Files that import a changed file and were not edited. */
  readonly dependentsNotInDiff: ReadonlyMap<string, readonly string[]>;
  /** File content hash, for overrule fingerprints (CL-2/CL-3). */
  fingerprint(path: string): string | null;
};

const BRANCH = /\b(if|else|switch|case|for|while|catch)\b|\?\?|\?[^.:]/;
const EXPORT_DECL =
  /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
const IMPORT_LINE =
  /\b(?:import|export)\b[^'"]*\bfrom\s*['"]([^'"]+)['"]|\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/;

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

function addedSpecifiers(lines: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const line of lines) {
    const match = IMPORT_LINE.exec(line);
    const spec = match?.[1] ?? match?.[2];
    if (spec) found.add(spec);
  }
  return found;
}

type Result = Omit<LensFinding, "lens">;

function compute(
  check: LensCheckId,
  receipt: ChangeReceipt,
  signals: LensSignals,
): Result {
  const changedSources = signals.changed.filter(
    (path) => SOURCE.test(path) && !isTestPath(path),
  );
  const untested = new Set(receipt.notProven.map((row) => row.path));
  switch (check) {
    case "off_limits_touched": {
      const hit = signals.changed
        .map((path) => ({ path, why: offLimitReason(path) }))
        .filter((row) => row.why);
      return hit.length === 0
        ? { check, status: "pass", evidence: [] }
        : {
            check,
            status: "fail",
            evidence: hit.map((row) => `${row.path} (${row.why})`),
          };
    }
    case "new_cross_package_edge": {
      // An edge is new when the session added its import line and no other
      // file already links the same two packages.
      const existing = new Set<string>();
      const fresh: { key: string; line: string }[] = [];
      for (const edge of signals.edges) {
        const fromPkg = signals.packageOf(edge.from);
        const toPkg = signals.packageOf(edge.to);
        if (fromPkg === toPkg) continue;
        const key = `${fromPkg || "(root)"} → ${toPkg || "(root)"}`;
        const added = addedSpecifiers(signals.addedLines.get(edge.from) ?? []);
        if (added.has(edge.source)) {
          fresh.push({ key, line: `${edge.from} imports ${edge.to} (${key})` });
        } else {
          existing.add(key);
        }
      }
      const novel = fresh.filter((row) => !existing.has(row.key));
      return novel.length === 0
        ? { check, status: "pass", evidence: [] }
        : {
            check,
            status: "fail",
            evidence: novel.slice(0, 20).map((row) => row.line),
          };
    }
    case "new_value_cycle": {
      const added = new Map(
        signals.changed.map((path) => [
          path,
          addedSpecifiers(signals.addedLines.get(path) ?? []),
        ]),
      );
      const fresh = signals.valueCycles.filter((cycle) =>
        cycle.some((from, i) => {
          const to = cycle[(i + 1) % cycle.length]!;
          const specs = added.get(from);
          if (!specs || specs.size === 0) return false;
          return signals.edges.some(
            (edge) =>
              edge.from === from &&
              edge.to === to &&
              !edge.typeOnly &&
              specs.has(edge.source),
          );
        }),
      );
      return fresh.length === 0
        ? { check, status: "pass", evidence: [] }
        : {
            check,
            status: "fail",
            evidence: fresh
              .slice(0, 5)
              .map((cycle) => [...cycle, cycle[0]].join(" → ")),
          };
    }
    case "reuse_missed": {
      const dupes = receipt.flags.filter((flag) => flag.kind === "duplicate");
      return dupes.length === 0
        ? { check, status: "pass", evidence: [] }
        : {
            check,
            status: "concern",
            evidence: dupes.map((flag) => `${flag.path}: ${flag.detail}`),
          };
    }
    case "new_dependency_added":
      return signals.dependenciesAdded.length === 0
        ? { check, status: "pass", evidence: [] }
        : {
            check,
            status: "concern",
            evidence: [...signals.dependenciesAdded],
          };
    case "untested_new_branch": {
      const hit = changedSources.filter(
        (path) =>
          untested.has(path) &&
          (signals.addedLines.get(path) ?? []).some((line) =>
            BRANCH.test(line),
          ),
      );
      return hit.length === 0
        ? { check, status: "pass", evidence: [] }
        : {
            check,
            status: "concern",
            evidence: hit.map((p) => `${p}: new branch, no test reaches it`),
          };
    }
    case "untested_changed_symbol": {
      const hit = changedSources.filter((path) => untested.has(path));
      return hit.length === 0
        ? { check, status: "pass", evidence: [] }
        : {
            check,
            status: "concern",
            evidence: hit.map((p) => `${p}: no test reaches it`),
          };
    }
    case "dependents_not_in_diff": {
      const evidence: string[] = [];
      for (const path of changedSources) {
        const changedExports = (signals.addedLines.get(path) ?? [])
          .map((line) => EXPORT_DECL.exec(line)?.[1])
          .filter((name): name is string => Boolean(name));
        const dependents = signals.dependentsNotInDiff.get(path) ?? [];
        if (changedExports.length > 0 && dependents.length > 0) {
          evidence.push(
            `${path} changes ${[...new Set(changedExports)].join(", ")}; not edited: ${dependents.slice(0, 5).join(", ")}${dependents.length > 5 ? ` (+${dependents.length - 5})` : ""}`,
          );
        }
      }
      return evidence.length === 0
        ? { check, status: "pass", evidence: [] }
        : { check, status: "fail", evidence };
    }
    case "test_reaches_but_not_run":
      if (receipt.testFiles.length === 0 || receipt.checksState === "done") {
        return { check, status: "pass", evidence: [] };
      }
      return {
        check,
        status: "concern",
        evidence: [
          `${receipt.testFiles.length} test file(s) reach the change; checks ${receipt.checksState === "pending" ? "are still running" : "did not run"}`,
        ],
      };
  }
}

/** First repo path an evidence line names, for overrule fingerprints. */
function evidencePath(line: string): string {
  return line.split(/[: ]/)[0]!;
}

function overruleFor(
  lens: LensDefinition,
  check: LensCheckId,
  path: string,
  signals: LensSignals,
): LensDefinition["overrules"][number] | undefined {
  const hash = signals.fingerprint(path);
  if (!hash) return undefined;
  const print = pathFingerprint(path, hash);
  return lens.overrules.find(
    (row) => row.check === check && row.fingerprint === print,
  );
}

/**
 * Run each enabled lens's checks. A finding the owner overruled on the same
 * fingerprint is reported as `overruled` with the note, until the file
 * changes (CL-2, CL-3).
 */
export function evaluateLensChecks(
  lenses: readonly LensDefinition[],
  receipt: ChangeReceipt,
  signals: LensSignals,
): LensFinding[] {
  const findings: LensFinding[] = [];
  for (const lens of lenses) {
    if (!lens.enabled) continue;
    for (const check of lens.checks) {
      const result = compute(check, receipt, signals);
      if (result.status === "fail" || result.status === "concern") {
        // Overruled only when every path the finding names still has the
        // fingerprint the owner overruled; any edit re-opens it (CL-3).
        const overrules = result.evidence.map((line) =>
          overruleFor(lens, check, evidencePath(line), signals),
        );
        const first = overrules[0];
        if (first && overrules.every(Boolean)) {
          findings.push({
            lens: lens.id,
            ...result,
            status: "overruled",
            note: first.note,
          });
          continue;
        }
      }
      findings.push({ lens: lens.id, ...result });
    }
  }
  return findings;
}

function git(root: string, args: readonly string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    recordEvent({
      event: "lens.git",
      outcome: "degraded",
      reason:
        error instanceof Error ? error.message.slice(0, 200) : String(error),
      workspace: root,
    });
    return null;
  }
}

function addedLinesFor(root: string, path: string): string[] {
  const tracked = git(root, ["ls-files", "--error-unmatch", "--", path]);
  if (tracked === null) {
    const abs = join(root, path);
    return existsSync(abs) ? readFileSync(abs, "utf8").split("\n") : [];
  }
  const diff =
    git(root, ["diff", "--no-color", "--unified=0", "HEAD", "--", path]) ?? "";
  return diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

const DEP_BLOCKS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

function depKeys(text: string | null): Set<string> {
  if (!text) return new Set();
  const keys = new Set<string>();
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    // A manifest mid-edit can be invalid JSON; nothing to compare yet.
    recordEvent({
      event: "lens.manifest",
      outcome: "degraded",
      reason:
        error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
    return keys;
  }
  for (const block of DEP_BLOCKS) {
    const deps = manifest[block];
    if (deps && typeof deps === "object") {
      for (const name of Object.keys(deps)) keys.add(name);
    }
  }
  return keys;
}

function dependenciesAdded(root: string, changed: readonly string[]): string[] {
  const out: string[] = [];
  for (const path of changed) {
    if (!/(^|\/)package\.json$/.test(path)) continue;
    const abs = join(root, path);
    const now = depKeys(existsSync(abs) ? readFileSync(abs, "utf8") : null);
    const before = depKeys(git(root, ["show", `HEAD:${path}`]));
    for (const name of now) if (!before.has(name)) out.push(`${path}: ${name}`);
  }
  return out;
}

const FILE_NODE = /^file:/;

/** Read the signals for the session's changed files from the workspace. */
export function gatherLensSignals(
  workspace: PrismWorkspace,
  changed: readonly string[],
): LensSignals {
  const root = workspace.rootPath;
  const changedSet = new Set(changed);
  const addedLines = new Map(
    changed.map((path) => [path, addedLinesFor(root, path)]),
  );
  const graph = workspace.getDependencyGraph();
  const edges = graph.ok
    ? graph.value.edges
        .filter((edge) => FILE_NODE.test(edge.from) && FILE_NODE.test(edge.to))
        .map((edge) => ({
          from: edge.from.replace(FILE_NODE, ""),
          to: edge.to.replace(FILE_NODE, ""),
          source:
            typeof edge.attrs?.source === "string" ? edge.attrs.source : "",
          typeOnly: edge.attrs?.typeOnly === true,
        }))
    : [];
  const cycles = workspace.getCycles();
  const dependents = new Map<string, string[]>();
  for (const edge of edges) {
    if (!changedSet.has(edge.to) || changedSet.has(edge.from)) continue;
    dependents.set(edge.to, [...(dependents.get(edge.to) ?? []), edge.from]);
  }
  const packages = new Map<string, string>();
  return {
    changed,
    addedLines,
    edges,
    valueCycles: cycles.ok ? cycles.value : [],
    packageOf(path) {
      const hit = packages.get(path);
      if (hit !== undefined) return hit;
      const pkg = packageRootFor(root, path);
      packages.set(path, pkg);
      return pkg;
    },
    dependenciesAdded: dependenciesAdded(root, changed),
    dependentsNotInDiff: dependents,
    fingerprint: (path) => contentFingerprint(root, path),
  };
}
