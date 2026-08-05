import { join } from "node:path";
import {
  type PrismError,
  type Result,
  type StackPackageProfile,
  type StackProfile,
  type StackProfileCore,
  type StackSignal,
  err,
  ok,
  prismError,
  PrismErrorCode,
} from "@repo-prism/shared";
import { StackDetectorRegistry } from "./registry.js";
import { discoverPackageRoots } from "./stack/package-roots.js";
import type { StackDetector, StackDetectorInfo } from "./types.js";

export type StackHostOptions = {
  readonly detectors?: readonly StackDetector[];
};

export type StackHost = {
  readonly id: "prism-stack";
  readonly registry: StackDetectorRegistry;
  listDetectors(): readonly StackDetectorInfo[];
  /** Detect stack at a single root (no package rollup). */
  detectProfile(
    rootAbsolutePath: string,
  ): Promise<Result<StackProfile, PrismError>>;
  /**
   * Workspace rollup: per-package profiles + union domains/personas/signals
   * including tooling signals from the workspace root (M-041 Mono-v1).
   */
  detectWorkspaceProfile(
    workspaceRootAbsolutePath: string,
  ): Promise<Result<StackProfile, PrismError>>;
};

function uniqueSorted(values: readonly string[]): string[] {
  const list = [...new Set(values)];
  list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return list;
}

function buildSummary(
  domains: readonly string[],
  signals: readonly StackSignal[],
  packageCount?: number,
): string {
  if (signals.length === 0) {
    return "Partial DNA: no stack signals detected";
  }
  const base = `Detected domains: ${domains.join(", ") || "none"} (${signals.length} signal(s))`;
  if (packageCount === undefined) return base;
  return `${base}; ${packageCount} package(s)`;
}

function toCore(profile: StackProfile): StackProfileCore {
  return {
    rootPath: profile.rootPath,
    generatedAt: profile.generatedAt,
    signals: profile.signals,
    domains: profile.domains,
    personas: profile.personas,
    summary: profile.summary,
  };
}

function signalKey(signal: StackSignal): string {
  return `${signal.id}\0${signal.domain}`;
}

/**
 * One entry per distinct signal, carrying every place it was found.
 *
 * Identity is the id and domain, not the evidence. Including evidence in the
 * key meant a tool configured in three packages arrived as three signals with
 * the same id — the screens key their rows by `signal.id`, so React saw
 * duplicate keys and the user saw the same tool listed repeatedly. Unioning
 * the evidence instead is also the more useful answer: "Moon, found in these
 * four places" rather than "Moon" four times.
 */
function mergeSignals(
  groups: readonly (readonly StackSignal[])[],
): StackSignal[] {
  const byKey = new Map<string, StackSignal>();
  for (const group of groups) {
    for (const signal of group) {
      const key = signalKey(signal);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, signal);
        continue;
      }
      byKey.set(key, {
        ...existing,
        evidence: uniqueSorted([...existing.evidence, ...signal.evidence]),
        personas: uniqueSorted([...existing.personas, ...signal.personas]),
        // Keep the strongest reading. A signal found weakly in one package and
        // firmly in another is firmly present in the workspace.
        confidence: Math.max(existing.confidence, signal.confidence),
      });
    }
  }
  return [...byKey.values()];
}

export function createStackHost(options: StackHostOptions = {}): StackHost {
  const registry = new StackDetectorRegistry();
  for (const detector of options.detectors ?? []) {
    const registered = registry.register(detector);
    if (!registered.ok) {
      throw new Error(
        `Failed to register detector "${detector.id}": ${registered.error.message}`,
      );
    }
  }

  const detectAt = async (
    rootAbsolutePath: string,
  ): Promise<Result<StackProfile, PrismError>> => {
    const root = rootAbsolutePath.trim();
    if (!root) {
      return err(
        prismError(PrismErrorCode.INVALID_PATH, "Workspace path is empty"),
      );
    }

    // Merged here too, not only in the workspace rollup: two detectors can
    // legitimately recognise the same tool from different evidence, and
    // without this a single-package repository gets the duplicate rows as well.
    const groups: StackSignal[][] = [];
    for (const detector of registry.detectors()) {
      const result = await detector.detect({ rootPath: root });
      if (!result.ok) return result;
      groups.push([...result.value]);
    }
    const signals = mergeSignals(groups);

    const domains = uniqueSorted(signals.map((s) => s.domain));
    const personas = uniqueSorted(signals.flatMap((s) => s.personas));

    const profile: StackProfile = {
      rootPath: root,
      generatedAt: new Date().toISOString(),
      signals,
      domains,
      personas,
      summary: buildSummary(domains, signals),
      packages: [],
    };
    return ok(profile);
  };

  return {
    id: "prism-stack",
    registry,
    listDetectors() {
      return registry.list();
    },
    detectProfile: detectAt,
    async detectWorkspaceProfile(workspaceRootAbsolutePath) {
      const workspaceRoot = workspaceRootAbsolutePath.trim();
      if (!workspaceRoot) {
        return err(
          prismError(PrismErrorCode.INVALID_PATH, "Workspace path is empty"),
        );
      }

      const workspaceDetect = await detectAt(workspaceRoot);
      if (!workspaceDetect.ok) return workspaceDetect;

      const roots = discoverPackageRoots(workspaceRoot);
      const packages: StackPackageProfile[] = [];

      for (const root of roots) {
        const abs =
          root.rootDir === ""
            ? workspaceRoot
            : join(workspaceRoot, root.rootDir);
        const detected =
          root.rootDir === "" ? workspaceDetect : await detectAt(abs);
        if (!detected.ok) return detected;
        packages.push({
          id: root.id,
          ...(root.name === undefined ? {} : { name: root.name }),
          rootDir: root.rootDir,
          profile: toCore(detected.value),
        });
      }

      const packageSignals = packages.map((p) => p.profile.signals);
      const signals = mergeSignals([
        workspaceDetect.value.signals,
        ...packageSignals,
      ]);
      const domains = uniqueSorted(signals.map((s) => s.domain));
      const personas = uniqueSorted(signals.flatMap((s) => s.personas));

      const rollup: StackProfile = {
        rootPath: workspaceRoot,
        generatedAt: new Date().toISOString(),
        signals,
        domains,
        personas,
        summary: buildSummary(domains, signals, packages.length),
        packages,
      };
      return ok(rollup);
    },
  };
}
