import {
  type PrismError,
  type Result,
  type StackProfile,
  type StackSignal,
  err,
  ok,
  prismError,
  PrismErrorCode,
} from "@prism/shared";
import { StackDetectorRegistry } from "./registry.js";
import type { StackDetector, StackDetectorInfo } from "./types.js";

export type StackHostOptions = {
  readonly detectors?: readonly StackDetector[];
};

export type StackHost = {
  readonly id: "prism-stack";
  readonly registry: StackDetectorRegistry;
  listDetectors(): readonly StackDetectorInfo[];
  detectProfile(
    rootAbsolutePath: string,
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
): string {
  if (signals.length === 0) {
    return "No stack signals detected (stub detectors; packs land in M-013)";
  }
  return `Detected domains: ${domains.join(", ") || "none"} (${signals.length} signal(s))`;
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

  return {
    id: "prism-stack",
    registry,
    listDetectors() {
      return registry.list();
    },
    async detectProfile(rootAbsolutePath: string) {
      const root = rootAbsolutePath.trim();
      if (!root) {
        return err(
          prismError(PrismErrorCode.INVALID_PATH, "Workspace path is empty"),
        );
      }

      const signals: StackSignal[] = [];
      for (const detector of registry.detectors()) {
        const result = await detector.detect({ rootPath: root });
        if (!result.ok) return result;
        signals.push(...result.value);
      }

      const domains = uniqueSorted(signals.map((s) => s.domain));
      const personas = uniqueSorted(signals.flatMap((s) => s.personas));

      const profile: StackProfile = {
        rootPath: root,
        generatedAt: new Date().toISOString(),
        signals,
        domains,
        personas,
        summary: buildSummary(domains, signals),
      };
      return ok(profile);
    },
  };
}
