import { access } from "node:fs/promises";
import { join } from "node:path";
import { StackDomain, type StackSignal, ok } from "@repo-prism/shared";
import { STACK_DETECTOR_SPI_VERSION } from "./spi-version.js";
import type { StackDetector } from "./types.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Placeholder detector — emits nothing (registry / wiring smoke). */
export function createUnknownDetector(): StackDetector {
  return {
    id: "unknown",
    spiVersion: STACK_DETECTOR_SPI_VERSION,
    domains: [StackDomain.UNKNOWN],
    personaHints: [],
    async detect() {
      return ok([]);
    },
  };
}

/**
 * Low-confidence tooling signal when `package.json` exists.
 * Richer packs live in `stack/packs.ts` (M-013).
 */
export function createNodejsManifestDetector(): StackDetector {
  return {
    id: "nodejs-manifest",
    spiVersion: STACK_DETECTOR_SPI_VERSION,
    domains: [StackDomain.TOOLING],
    personaHints: [],
    async detect(ctx) {
      const pkg = join(ctx.rootPath, "package.json");
      if (!(await exists(pkg))) {
        return ok([]);
      }
      const signal: StackSignal = {
        id: "nodejs-manifest",
        domain: StackDomain.TOOLING,
        confidence: 0.4,
        personas: [],
        evidence: ["package.json"],
      };
      return ok([signal]);
    },
  };
}
