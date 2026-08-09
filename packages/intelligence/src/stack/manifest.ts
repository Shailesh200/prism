import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type DeveloperPersonaId,
  type StackDomainId,
  type StackSignal,
  ok,
  type Result,
  type PrismError,
} from "@repo-prism/shared";
import { STACK_DETECTOR_SPI_VERSION } from "../spi-version.js";
import type { StackDetectContext, StackDetector } from "../types.js";

export async function pathExists(abs: string): Promise<boolean> {
  try {
    await access(abs);
    return true;
  } catch {
    return false;
  }
}

export type PackageJson = {
  readonly name?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly workspaces?: unknown;
  readonly scripts?: Record<string, string>;
};

export async function readPackageJson(
  rootPath: string,
  rel = "package.json",
): Promise<PackageJson | null> {
  const abs = join(rootPath, rel);
  if (!(await pathExists(abs))) return null;
  try {
    return JSON.parse(await readFile(abs, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

export function allDeps(pkg: PackageJson): Set<string> {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);
}

export function hasAnyDep(pkg: PackageJson, names: readonly string[]): boolean {
  const deps = allDeps(pkg);
  return names.some((n) => deps.has(n));
}

/** Production-facing deps (excludes `devDependencies`). */
export function hasProdDep(
  pkg: PackageJson,
  names: readonly string[],
): boolean {
  const deps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);
  return names.some((n) => deps.has(n));
}

export function hasDevDep(pkg: PackageJson, names: readonly string[]): boolean {
  const deps = new Set(Object.keys(pkg.devDependencies ?? {}));
  return names.some((n) => deps.has(n));
}

export type ManifestMatch = {
  readonly confidence: number;
  readonly evidence: string[];
  readonly personas?: readonly DeveloperPersonaId[];
};

/** M-061 multi-signal weights / gates. */
export const STACK_WEIGHT_PROD_DEP = 0.5;
export const STACK_WEIGHT_CONFIG = 0.3;
export const STACK_WEIGHT_PATH = 0.2;
export const STACK_DEVDEP_ONLY_CAP = 0.4;
export const STACK_DETECTION_THRESHOLD = 0.6;

export type MultiSignalScoreInput = {
  /** Named package present in `dependencies` / peer / optional. */
  readonly prodDep?: boolean;
  /**
   * Tooling-domain detectors may count `devDependencies` as the dep channel
   * (vitest/jest/turbo live there by nature).
   */
  readonly toolingDep?: boolean;
  /** Entry / config file (next.config, Dockerfile, manage.py, …). */
  readonly config?: boolean;
  /** Path convention (src/components, k8s/, notebooks/, …). */
  readonly path?: boolean;
  /**
   * Canonical ecosystem root that is itself the stack marker (go.mod,
   * Dockerfile, Chart.yaml, …). Counts as prodDep + config (= 0.8).
   */
  readonly ecosystemRoot?: boolean;
  /**
   * Package appears only in `devDependencies` for a product-domain detector.
   * Caps confidence at {@link STACK_DEVDEP_ONLY_CAP}.
   */
  readonly devDepOnly?: boolean;
  readonly evidence: readonly string[];
};

/**
 * Weighted multi-signal stack hit (M-061 P-E1).
 * Returns null when below the detection threshold (0.6).
 */
export function scoreMultiSignal(
  input: MultiSignalScoreInput,
): ManifestMatch | null {
  let confidence = 0;
  if (input.ecosystemRoot) {
    confidence += STACK_WEIGHT_PROD_DEP + STACK_WEIGHT_CONFIG;
  } else {
    if (input.prodDep || input.toolingDep) confidence += STACK_WEIGHT_PROD_DEP;
    if (input.config) confidence += STACK_WEIGHT_CONFIG;
  }
  if (input.path) confidence += STACK_WEIGHT_PATH;

  if (input.devDepOnly && !input.prodDep && !input.ecosystemRoot) {
    confidence = Math.min(confidence, STACK_DEVDEP_ONLY_CAP);
  }

  if (confidence < STACK_DETECTION_THRESHOLD) return null;
  return {
    confidence: Math.min(1, confidence),
    evidence: [...input.evidence],
  };
}

const NOISE_PATH_SEGMENTS = new Set([
  "docs",
  "doc",
  "documentation",
  "examples",
  "example",
  "samples",
  "sample",
  "fixtures",
  "fixture",
  "vendor",
  "third_party",
  "third-party",
]);

/** True when a relative path sits under a docs/examples/samples-style prefix. */
export function isNoiseEvidencePath(rel: string): boolean {
  const parts = rel.split(/[/\\]/).filter(Boolean);
  return parts.some((p) => NOISE_PATH_SEGMENTS.has(p.toLowerCase()));
}

/** Keep evidence that is not under docs/examples noise prefixes. */
export function filterNoiseEvidence(paths: readonly string[]): string[] {
  return paths.filter((p) => !isNoiseEvidencePath(p));
}

/** Read requirements.txt lines that look like package pins. */
export async function requirementsMentions(
  rootPath: string,
  pattern: RegExp,
): Promise<boolean> {
  const abs = join(rootPath, "requirements.txt");
  if (!(await pathExists(abs))) return false;
  try {
    const text = await readFile(abs, "utf8");
    return pattern.test(text);
  } catch {
    return false;
  }
}

/** Shallow search for an exact basename (depth-limited, skips noise dirs). */
export async function findFilesNamed(
  rootPath: string,
  fileName: string,
  maxDepth = 3,
  maxHits = 4,
): Promise<string[]> {
  const hits: string[] = [];
  const want = fileName.toLowerCase();

  async function walk(dir: string, rel: string, depth: number): Promise<void> {
    if (hits.length >= maxHits || depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (hits.length >= maxHits) return;
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === "dist" ||
        entry.name === ".prism" ||
        NOISE_PATH_SEGMENTS.has(entry.name.toLowerCase())
      ) {
        continue;
      }
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isFile() && entry.name.toLowerCase() === want) {
        hits.push(childRel);
      } else if (entry.isDirectory()) {
        await walk(join(dir, entry.name), childRel, depth + 1);
      }
    }
  }

  await walk(rootPath, "", 0);
  return hits;
}

/**
 * True when any of `names` exists as a directory/file under root, excluding
 * docs/examples noise paths. Prefers exact candidates, then shallow walk.
 */
export async function findPathConventionHits(
  rootPath: string,
  names: readonly string[],
  maxDepth = 3,
): Promise<string[]> {
  const exact = filterNoiseEvidence(await existingEvidence(rootPath, names));
  if (exact.length > 0) return exact;

  const hits: string[] = [];
  const want = new Set(names.map((n) => n.toLowerCase()));

  async function walk(dir: string, rel: string, depth: number): Promise<void> {
    if (hits.length > 0 || depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (hits.length > 0) return;
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === "dist" ||
        entry.name === ".prism" ||
        NOISE_PATH_SEGMENTS.has(entry.name.toLowerCase())
      ) {
        continue;
      }
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (want.has(entry.name.toLowerCase())) {
        hits.push(childRel);
        return;
      }
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), childRel, depth + 1);
      }
    }
  }

  await walk(rootPath, "", 0);
  return hits;
}

/** Relative evidence paths that exist under root. */
export async function existingEvidence(
  rootPath: string,
  candidates: readonly string[],
): Promise<string[]> {
  const out: string[] = [];
  for (const rel of candidates) {
    if (await pathExists(join(rootPath, rel))) out.push(rel);
  }
  return out;
}

/** Shallow search for an extension (depth-limited, skips node_modules). */
export async function findFilesWithExt(
  rootPath: string,
  ext: string,
  maxDepth = 3,
  maxHits = 8,
): Promise<string[]> {
  const hits: string[] = [];
  const normalized = ext.startsWith(".") ? ext.toLowerCase() : `.${ext}`;

  async function walk(dir: string, rel: string, depth: number): Promise<void> {
    if (hits.length >= maxHits || depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (hits.length >= maxHits) return;
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === "dist" ||
        entry.name === ".prism" ||
        NOISE_PATH_SEGMENTS.has(entry.name.toLowerCase())
      ) {
        continue;
      }
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(childAbs, childRel, depth + 1);
      } else if (entry.name.toLowerCase().endsWith(normalized)) {
        hits.push(childRel);
      }
    }
  }

  await walk(rootPath, "", 0);
  return hits;
}

export function createManifestDetector(options: {
  readonly id: string;
  readonly domains: readonly StackDomainId[];
  readonly personaHints: readonly DeveloperPersonaId[];
  readonly match: (ctx: StackDetectContext) => Promise<ManifestMatch | null>;
}): StackDetector {
  return {
    id: options.id,
    spiVersion: STACK_DETECTOR_SPI_VERSION,
    domains: options.domains,
    personaHints: options.personaHints,
    async detect(ctx): Promise<Result<readonly StackSignal[], PrismError>> {
      const hit = await options.match(ctx);
      if (!hit) return ok([]);
      const signal: StackSignal = {
        id: options.id,
        domain: options.domains[0] ?? "unknown",
        confidence: hit.confidence,
        personas: [...(hit.personas ?? options.personaHints)],
        evidence: hit.evidence,
      };
      return ok([signal]);
    },
  };
}
