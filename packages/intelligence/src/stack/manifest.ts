import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type DeveloperPersonaId,
  type StackDomainId,
  type StackSignal,
  ok,
  type Result,
  type PrismError,
} from "@prism/shared";
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
        entry.name === ".prism"
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

export type ManifestMatch = {
  readonly confidence: number;
  readonly evidence: string[];
  readonly personas?: readonly DeveloperPersonaId[];
};

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
